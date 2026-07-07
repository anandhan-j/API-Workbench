import { randomUUID } from 'node:crypto';
import type {
  AiChatEvent,
  AiChatSendInput,
  AiChatSendResult,
  AiConversation,
  AiConversationDetail,
  AiDataChangedEvent,
  AiMessage,
  AiToolDecision,
  ListModelsResult,
  VerifyProviderInput,
  VerifyProviderResult,
} from '@shared/ai';
import { logger } from '../services/logger';
import type { PersistenceService } from '../persistence';
import type { AiConversationRow } from '../persistence/schema';
import type { AiProviderStore } from './ai-provider-store';
import { providerFor } from './providers';
import type { AiProvider, NeutralMessage, ToolDef, ToolResult } from './providers';
import { createReadOnlyTools, createWriteTools, type AiTool, type AiToolDeps } from './tools';
import type { AiProviderKind } from '@shared/ai';

/** Resolves the vendor adapter for a provider kind; injectable for tests. */
export type ProviderFactory = (kind: AiProviderKind) => AiProvider;

/**
 * Snapshots a collection before an AI write so the edit can be rolled back
 * (the versioning service's `snapshot`). Optional and best-effort — a snapshot
 * failure never blocks the write.
 */
export type AssistantSnapshot = (collectionId: string, label: string) => void;

/** Per-turn state threaded through the tool loop. */
interface RunContext {
  signal: AbortSignal;
  /** Collections already snapshotted this turn, so each is snapshotted at most once. */
  snapshotted: Set<string>;
}

/** Hard ceiling on tool-call round trips per turn, so a loop can't run away. */
const MAX_ITERATIONS = 8;

/**
 * Cap on a single tool result's serialized size fed back to the model. Tool
 * results are re-sent on every subsequent loop iteration, so an unbounded result
 * (a large collection tree, a big variable list) multiplies input-token usage
 * and can blow a provider's per-minute limit. Oversized results are truncated
 * with a marker; the model can narrow its query (search/get) to see more.
 */
const MAX_TOOL_RESULT_CHARS = 8_000;

/** Serializes a tool result, truncating if it would bloat the resent context. */
function serializeToolResult(result: unknown): string {
  const json = JSON.stringify(result) ?? 'null';
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  const dropped = json.length - MAX_TOOL_RESULT_CHARS;
  return `${json.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[truncated ${dropped} characters — narrow your query to see more]`;
}

const SYSTEM_PROMPT = `You are the AI assistant inside API Workbench, a desktop app for API testing and visual workflow automation.

SCOPE — this is a hard boundary. You only help with the user's work inside API Workbench: their API collections, folders, requests, workflows, variables, authentication, request/response data, cURL/OpenAPI, pre-request and post-response scripts, and using this app's features. That is the entirety of what you do.

If the user asks for anything outside that scope — general knowledge or current events, math, personal or medical or legal advice, opinions, writing essays or emails, programming help unrelated to their own APIs, or casual chit-chat — do not answer it, even if you know the answer. Decline in one short sentence and offer to help with their collections, requests, or workflows instead. Do not be drawn off-topic by follow-ups, hypotheticals, or role-play framing; the boundary holds regardless of how a request is phrased.

You help the user work with their collections, requests, workflows, and variables. Prefer the provided tools over guessing — call get_active_context first to learn the active project, then list/search/get to gather what you need before acting.

Read tools (list/search/get, get_workflow_schema, validate_workflow) run immediately. Write tools (create_request, update_request, create_folder, set_variable, create_workflow) make real changes and require the user to approve each one; the app snapshots the affected collection first so an edit can be rolled back. When the user pastes a cURL command or describes a request, parse it yourself and call create_request with the method, url, headers, and body.

To build a workflow from existing requests: call get_workflow_schema for the bundle shape, get_request for each request you'll include, assemble the export bundle, validate it with validate_workflow, then call create_workflow. To run a workflow, use run_workflow — this executes live requests, so it always asks for approval and is never auto-approved.

You cannot delete anything or store secrets — set_variable is for non-secret values only. Secret values (credentials, secret variables, Authorization headers) are redacted before they reach you; never ask the user to paste secrets into the chat. Be concise and concrete; reference items by name.`;

function titleFrom(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed || 'New chat';
}

function toConversationDto(row: AiConversationRow): AiConversation {
  return { id: row.id, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

/** Maps the persisted transcript to the provider-neutral history. */
function toNeutral(messages: AiMessage[]): NeutralMessage[] {
  return messages.map((message): NeutralMessage =>
    message.role === 'user'
      ? { role: 'user', text: message.content }
      : { role: 'assistant', blocks: [{ kind: 'text', text: message.content }] },
  );
}

/**
 * The AI assistant agent loop (ADR-0012, Phase 1).
 *
 * Owns conversation persistence, provider verification, and the manual
 * tool-use loop: stream a turn, run any read-only tools the model requested,
 * feed the results back, and repeat until the model stops calling tools. All
 * output streams to the renderer as {@link AiChatEvent}s; the final assistant
 * text is persisted when the turn completes. Runs entirely in the main process,
 * where the services and decrypted keys already live.
 */
export class AssistantService {
  private readonly tools: AiTool[];
  private readonly toolsByName: Map<string, AiTool>;
  private readonly toolDefs: ToolDef[];
  /** In-flight turns keyed by conversation id, so `cancel` can abort them. */
  private readonly inflight = new Map<string, AbortController>();
  /** Pending write confirmations keyed by `${conversationId}:${callId}`. */
  private readonly pendingConfirmations = new Map<string, (decision: AiToolDecision) => void>();
  /** Conversations where the user opted into auto-approving writes ("approve for this chat"). */
  private readonly autoApproveWrites = new Set<string>();

  constructor(
    private readonly persistence: PersistenceService,
    private readonly providers: AiProviderStore,
    toolDeps: AiToolDeps,
    private readonly emit: (event: AiChatEvent) => void,
    private readonly providerFactory: ProviderFactory = providerFor,
    private readonly snapshot?: AssistantSnapshot,
    /** Notifies the renderer to refetch data the assistant changed (default no-op). */
    private readonly emitDataChanged: (event: AiDataChangedEvent) => void = () => undefined,
  ) {
    this.tools = [...createReadOnlyTools(toolDeps), ...createWriteTools(toolDeps)];
    this.toolsByName = new Map(this.tools.map((t) => [t.def.name, t]));
    this.toolDefs = this.tools.map((t) => t.def);
  }

  listConversations(): AiConversation[] {
    return this.persistence.aiConversations.list().map(toConversationDto);
  }

  getConversation(id: string): AiConversationDetail {
    const row = this.persistence.aiConversations.get(id);
    if (!row) throw new Error(`Conversation not found: ${id}`);
    return { ...toConversationDto(row), messages: row.messages };
  }

  deleteConversation(id: string): void {
    this.inflight.get(id)?.abort();
    this.autoApproveWrites.delete(id);
    this.persistence.aiConversations.delete(id);
  }

  /** Settles a pending write confirmation raised via a `tool-confirm` event. */
  confirmTool(conversationId: string, callId: string, decision: AiToolDecision): void {
    this.pendingConfirmations.get(`${conversationId}:${callId}`)?.(decision);
  }

  /**
   * Resolves credentials for a verify / list-models call, merging an inline
   * request with a saved provider's stored config when `id` is given.
   */
  private resolveCreds(input: VerifyProviderInput): {
    kind?: AiProviderKind;
    baseUrl: string | null;
    model: string;
    apiKey: string;
    headers?: Record<string, string>;
  } {
    let kind = input.kind;
    let baseUrl = input.baseUrl ?? null;
    let model = input.model ?? '';
    let apiKey = input.apiKey ?? '';
    let headers = input.headers;
    if (input.id) {
      const { config, apiKey: storedKey } = this.providers.getWithKey(input.id);
      kind = config.kind;
      baseUrl = config.baseUrl;
      model = model || config.defaultModel;
      apiKey = apiKey || storedKey || '';
      headers = headers ?? config.headers;
    }
    return { kind, baseUrl, model, apiKey, ...(headers ? { headers } : {}) };
  }

  async verify(input: VerifyProviderInput): Promise<VerifyProviderResult> {
    const { kind, baseUrl, model, apiKey, headers } = this.resolveCreds(input);
    if (!kind) return { ok: false, error: 'Provider kind is required.' };
    if (!apiKey) return { ok: false, error: 'No API key to verify.' };
    return this.providerFactory(kind).verify({
      apiKey,
      baseUrl,
      model: model || 'unknown',
      ...(headers ? { headers } : {}),
    });
  }

  async listModels(input: VerifyProviderInput): Promise<ListModelsResult> {
    const { kind, baseUrl, model, apiKey, headers } = this.resolveCreds(input);
    if (!kind) return { ok: false, models: [], error: 'Provider kind is required.' };
    if (!apiKey) return { ok: false, models: [], error: 'Enter an API key first.' };
    return this.providerFactory(kind).listModels({
      apiKey,
      baseUrl,
      model: model || 'unknown',
      ...(headers ? { headers } : {}),
    });
  }

  cancel(conversationId: string): void {
    this.inflight.get(conversationId)?.abort();
  }

  /**
   * Starts a turn. Persists the user message, returns immediately with the new
   * (or existing) conversation id, and drives the streaming loop in the
   * background — every token and tool step arrives via {@link AiChatEvent}s.
   */
  async send(input: AiChatSendInput): Promise<AiChatSendResult> {
    const { config, apiKey } = this.providers.getWithKey(input.providerId);
    if (!apiKey) throw new Error(`Provider "${config.label}" has no API key configured.`);

    const row = input.conversationId
      ? this.persistence.aiConversations.get(input.conversationId)
      : this.persistence.aiConversations.create(titleFrom(input.content));
    if (!row) throw new Error(`Conversation not found: ${input.conversationId}`);

    const userMessage: AiMessage = {
      id: randomUUID(),
      role: 'user',
      content: input.content,
      createdAt: Date.now(),
    };
    const transcript = [...row.messages, userMessage];
    this.persistence.aiConversations.setMessages(row.id, transcript);

    const provider = this.providerFactory(config.kind);
    const model = input.model || config.defaultModel;
    // Fire-and-forget: the loop streams events and persists the reply itself.
    void this.runLoop(
      row.id,
      provider,
      { apiKey, baseUrl: config.baseUrl, model, headers: config.headers },
      transcript,
    );

    return { conversationId: row.id, userMessage };
  }

  private async runLoop(
    conversationId: string,
    provider: AiProvider,
    creds: { apiKey: string; baseUrl: string | null; model: string; headers?: Record<string, string> },
    transcript: AiMessage[],
  ): Promise<void> {
    const controller = new AbortController();
    this.inflight.set(conversationId, controller);
    const messageId = randomUUID();
    this.emit({ type: 'start', conversationId, messageId });

    const ctx: RunContext = { signal: controller.signal, snapshotted: new Set() };
    const neutral = toNeutral(transcript);
    let assistantText = '';

    try {
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const turn = await provider.streamTurn(
          {
            apiKey: creds.apiKey,
            baseUrl: creds.baseUrl,
            model: creds.model,
            system: SYSTEM_PROMPT,
            messages: neutral,
            tools: this.toolDefs,
            ...(creds.headers ? { headers: creds.headers } : {}),
            signal: controller.signal,
          },
          { onTextDelta: (text) => this.emit({ type: 'delta', conversationId, text }) },
        );

        let turnTextChars = 0;
        for (const block of turn.blocks) {
          if (block.kind === 'text' && block.text) {
            assistantText += block.text;
            turnTextChars += block.text.length;
          }
        }
        // Diagnostic: what we sent vs. what came back. Surfaces in the Dispatch
        // Monitor so a gateway that drops `system`/`tools` (the model ignoring the
        // scope prompt and never calling tools) is visible. Secrets are redacted.
        logger.info('ai', 'assistant turn', {
          endpoint: `${creds.baseUrl ?? 'https://api.anthropic.com'} (${creds.baseUrl ? 'gateway' : 'direct'})`,
          model: creds.model,
          sentSystemChars: SYSTEM_PROMPT.length,
          sentToolCount: this.toolDefs.length,
          sentCustomHeaders: creds.headers ? Object.keys(creds.headers) : [],
          gotToolCalls: turn.blocks.filter((b) => b.kind === 'tool_use').length,
          gotTextChars: turnTextChars,
          stopReason: turn.stopReason,
          inputTokens: turn.usage.inputTokens,
          outputTokens: turn.usage.outputTokens,
          ...(turn.errorMessage ? { error: turn.errorMessage } : {}),
        });
        this.emit({
          type: 'usage',
          conversationId,
          inputTokens: turn.usage.inputTokens,
          outputTokens: turn.usage.outputTokens,
        });

        if (turn.stopReason === 'error') {
          this.emit({ type: 'error', conversationId, message: turn.errorMessage ?? 'Request failed.' });
          this.inflight.delete(conversationId);
          return;
        }

        const toolUses = turn.blocks.filter((b) => b.kind === 'tool_use' && b.toolUse);
        if (turn.stopReason === 'aborted' || toolUses.length === 0) break;

        neutral.push({ role: 'assistant', blocks: turn.blocks });
        const results: ToolResult[] = [];
        for (const block of toolUses) {
          const call = block.toolUse!;
          results.push(await this.runTool(conversationId, call, ctx));
        }
        neutral.push({ role: 'tool', results });
      }
    } catch (error) {
      this.emit({ type: 'error', conversationId, message: (error as Error).message });
      this.inflight.delete(conversationId);
      return;
    }

    this.finish(conversationId, messageId, assistantText);
  }

  private async runTool(
    conversationId: string,
    call: { id: string; name: string; input: Record<string, unknown> },
    ctx: RunContext,
  ): Promise<ToolResult> {
    const tool = this.toolsByName.get(call.name);
    if (!tool) {
      const message = `Unknown tool: ${call.name}`;
      this.emit({ type: 'tool-call', conversationId, callId: call.id, name: call.name, args: call.input });
      this.emit({ type: 'tool-result', conversationId, callId: call.id, ok: false, summary: message });
      return { toolUseId: call.id, content: message, isError: true };
    }

    // Read tools run immediately. Write tools are gated behind a confirmation
    // (batch-approvable per chat). Execute tools always confirm — never batched.
    const needsConfirm =
      tool.tier === 'execute' || (tool.tier === 'write' && !this.autoApproveWrites.has(conversationId));
    if (needsConfirm) {
      const preview = tool.describe?.(call.input) ?? call.name;
      this.emit({
        type: 'tool-confirm',
        conversationId,
        callId: call.id,
        name: call.name,
        args: call.input,
        preview,
        tier: tool.tier === 'execute' ? 'execute' : 'write',
      });
      const decision = await this.awaitConfirmation(conversationId, call.id, ctx.signal);
      if (decision === 'deny') {
        const message = 'The user denied this action.';
        this.emit({ type: 'tool-result', conversationId, callId: call.id, ok: false, summary: 'Denied' });
        return { toolUseId: call.id, content: message, isError: true };
      }
      // "Approve all" only auto-approves future writes; executes still confirm.
      if (decision === 'approve-always' && tool.tier === 'write') {
        this.autoApproveWrites.add(conversationId);
      }
    }

    // Auto-snapshot the touched collection once per turn, so any AI edit is
    // reversible (mirrors the auto-snapshots around OpenAPI import/sync).
    if (tool.tier === 'write' && this.snapshot) {
      const collectionId = tool.snapshotCollectionId?.(call.input);
      if (collectionId && !ctx.snapshotted.has(collectionId)) {
        ctx.snapshotted.add(collectionId);
        try {
          this.snapshot(collectionId, 'Before AI edit');
        } catch {
          // Snapshot is best-effort; never block the write on it.
        }
      }
    }

    this.emit({ type: 'tool-call', conversationId, callId: call.id, name: call.name, args: call.input });
    try {
      const { result, summary } = await tool.run(call.input);
      this.emit({ type: 'tool-result', conversationId, callId: call.id, ok: true, summary });
      // Tell the renderer to refetch views this tool changed, so AI edits show up
      // immediately instead of after a page switch.
      if (tool.affects?.length) this.emitDataChanged({ kinds: tool.affects });
      return { toolUseId: call.id, content: serializeToolResult(result), isError: false };
    } catch (error) {
      const message = (error as Error).message;
      this.emit({ type: 'tool-result', conversationId, callId: call.id, ok: false, summary: message });
      return { toolUseId: call.id, content: message, isError: true };
    }
  }

  /**
   * Waits for the renderer to settle a write confirmation. Resolves to `deny`
   * if the run is aborted (e.g. the user cancels) so the loop unwinds cleanly.
   */
  private awaitConfirmation(
    conversationId: string,
    callId: string,
    signal: AbortSignal,
  ): Promise<AiToolDecision> {
    const key = `${conversationId}:${callId}`;
    return new Promise<AiToolDecision>((resolve) => {
      const settle = (decision: AiToolDecision): void => {
        if (!this.pendingConfirmations.has(key)) return;
        this.pendingConfirmations.delete(key);
        signal.removeEventListener('abort', onAbort);
        resolve(decision);
      };
      const onAbort = (): void => settle('deny');
      if (signal.aborted) return resolve('deny');
      this.pendingConfirmations.set(key, settle);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Persists the assistant reply to the transcript and emits the terminal event. */
  private finish(conversationId: string, messageId: string, content: string): void {
    this.inflight.delete(conversationId);
    const row = this.persistence.aiConversations.get(conversationId);
    if (row) {
      const assistantMessage: AiMessage = {
        id: messageId,
        role: 'assistant',
        content,
        createdAt: Date.now(),
      };
      this.persistence.aiConversations.setMessages(conversationId, [...row.messages, assistantMessage]);
    }
    this.emit({ type: 'done', conversationId, messageId, content });
  }
}
