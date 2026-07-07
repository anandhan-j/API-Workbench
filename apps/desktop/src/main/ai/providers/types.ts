import type { ListModelsResult, VerifyProviderResult } from '@shared/ai';

/**
 * The provider port (ADR-0012). One neutral, streaming chat-with-tools turn
 * that each vendor adapter implements. Modeled after Anthropic's content-block
 * shape (text + tool_use); the OpenAI-compatible adapter translates to/from
 * chat-completions function calls. Keeping the loop provider-agnostic means
 * adding a vendor is a new adapter, never a change to the agent loop.
 */

/** A tool the model may call: JSON-schema parameters plus a description. */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema object for the tool's input. */
  parameters: Record<string, unknown>;
}

/** One block of an assistant turn: either text or a tool invocation. */
export interface AssistantBlock {
  kind: 'text' | 'tool_use';
  /** Present when `kind === 'text'`. */
  text?: string;
  /** Present when `kind === 'tool_use'`. */
  toolUse?: { id: string; name: string; input: Record<string, unknown> };
}

/** A tool execution result fed back to the model. */
export interface ToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}

/** The neutral conversation history handed to a provider for one turn. */
export type NeutralMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; blocks: AssistantBlock[] }
  | { role: 'tool'; results: ToolResult[] };

export interface StreamTurnParams {
  apiKey: string;
  baseUrl: string | null;
  model: string;
  system: string;
  messages: NeutralMessage[];
  tools: ToolDef[];
  /** Extra HTTP headers merged onto the request (gateway routing / auth). */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type StopReason = 'end' | 'tool_use' | 'error' | 'aborted';

export interface AssistantTurn {
  blocks: AssistantBlock[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: StopReason;
  /** Set when `stopReason === 'error'`. */
  errorMessage?: string;
}

export interface StreamCallbacks {
  /** Fired for each streamed text fragment of the assistant's reply. */
  onTextDelta(delta: string): void;
}

export interface VerifyParams {
  apiKey: string;
  baseUrl: string | null;
  model: string;
  /** Extra HTTP headers merged onto the request (gateway routing / auth). */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface AiProvider {
  streamTurn(params: StreamTurnParams, cb: StreamCallbacks): Promise<AssistantTurn>;
  verify(params: VerifyParams): Promise<VerifyProviderResult>;
  /** Fetches the models the credentials can access, for the model picker. */
  listModels(params: VerifyParams): Promise<ListModelsResult>;
}
