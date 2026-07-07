import type {
  AiProvider,
  AssistantBlock,
  AssistantTurn,
  NeutralMessage,
  StreamCallbacks,
  StreamTurnParams,
  VerifyParams,
} from './types';
import type { ListModelsResult, VerifyProviderResult } from '@shared/ai';
import { readSse, truncate, formatApiError } from './sse';
import { fetchWithRetry } from './retry';

const DEFAULT_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

/** Translates the neutral history into Anthropic's message/content-block shape. */
function toAnthropicMessages(messages: NeutralMessage[]): AnthropicMessage[] {
  return messages.map((message): AnthropicMessage => {
    if (message.role === 'user') {
      return { role: 'user', content: [{ type: 'text', text: message.text }] };
    }
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.blocks.map((block) =>
          block.kind === 'text'
            ? { type: 'text', text: block.text ?? '' }
            : {
                type: 'tool_use',
                id: block.toolUse?.id,
                name: block.toolUse?.name,
                input: block.toolUse?.input ?? {},
              },
        ),
      };
    }
    // Tool results ride back to Anthropic as a user turn of tool_result blocks.
    return {
      role: 'user',
      content: message.results.map((result) => ({
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: result.content,
        is_error: result.isError,
      })) as unknown as AnthropicContentBlock[],
    };
  });
}

/** In-progress block accumulated from streamed events, keyed by content index. */
interface Accum {
  kind: 'text' | 'tool_use';
  text: string;
  id?: string;
  name?: string;
  partialJson: string;
}

/**
 * Anthropic Messages API adapter (raw SSE over `fetch`). Kept behind the
 * {@link AiProvider} port so the official SDK can replace it later without
 * touching the agent loop. Extended thinking is intentionally not requested:
 * the model is user-chosen (BYOK) and may predate adaptive thinking.
 */
export class AnthropicProvider implements AiProvider {
  async streamTurn(params: StreamTurnParams, cb: StreamCallbacks): Promise<AssistantTurn> {
    const base = params.baseUrl || DEFAULT_BASE;
    const usage = { inputTokens: 0, outputTokens: 0 };
    const blocks = new Map<number, Accum>();
    let stopReason: AssistantTurn['stopReason'] = 'end';

    let res: Response;
    try {
      res = await fetchWithRetry(
        `${base}/v1/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': params.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            // Gateway headers last, so a fronting gateway can add its own auth/routing.
            ...(params.headers ?? {}),
          },
          body: JSON.stringify({
            model: params.model,
            max_tokens: MAX_TOKENS,
            stream: true,
            ...(params.system ? { system: params.system } : {}),
            ...(params.tools.length
              ? {
                  tools: params.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    input_schema: t.parameters,
                  })),
                }
              : {}),
            messages: toAnthropicMessages(params.messages),
          }),
        },
        params.signal,
      );
    } catch (error) {
      if (params.signal?.aborted) return this.aborted(blocks, usage);
      return this.error(`Request failed: ${(error as Error).message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return this.error(formatApiError('Anthropic', res.status, text));
    }

    try {
      for await (const raw of readSse(res)) {
        const event = raw as Record<string, unknown>;
        const type = event['type'] as string;
        if (type === 'message_start') {
          const message = event['message'] as { usage?: { input_tokens?: number } } | undefined;
          usage.inputTokens = message?.usage?.input_tokens ?? 0;
        } else if (type === 'content_block_start') {
          const index = event['index'] as number;
          const block = event['content_block'] as AnthropicContentBlock;
          blocks.set(index, {
            kind: block.type === 'tool_use' ? 'tool_use' : 'text',
            text: '',
            id: block.id,
            name: block.name,
            partialJson: '',
          });
        } else if (type === 'content_block_delta') {
          const index = event['index'] as number;
          const delta = event['delta'] as { type: string; text?: string; partial_json?: string };
          const accum = blocks.get(index);
          if (!accum) continue;
          if (delta.type === 'text_delta' && delta.text) {
            accum.text += delta.text;
            cb.onTextDelta(delta.text);
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            accum.partialJson += delta.partial_json;
          }
        } else if (type === 'message_delta') {
          const delta = event['delta'] as { stop_reason?: string } | undefined;
          const usageDelta = event['usage'] as { output_tokens?: number } | undefined;
          if (usageDelta?.output_tokens) usage.outputTokens = usageDelta.output_tokens;
          if (delta?.stop_reason === 'tool_use') stopReason = 'tool_use';
        }
      }
    } catch (error) {
      if (params.signal?.aborted) return this.aborted(blocks, usage);
      return this.error(`Stream failed: ${(error as Error).message}`);
    }

    return { blocks: this.finalize(blocks), usage, stopReason };
  }

  async verify(params: VerifyParams): Promise<VerifyProviderResult> {
    const base = params.baseUrl || DEFAULT_BASE;
    try {
      const res = await fetch(`${base}/v1/models`, {
        headers: {
          'x-api-key': params.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          ...(params.headers ?? {}),
        },
        signal: params.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: `${res.status}: ${truncate(text, 160)}` };
      }
      return { ok: true, model: params.model };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  async listModels(params: VerifyParams): Promise<ListModelsResult> {
    const base = params.baseUrl || DEFAULT_BASE;
    try {
      const res = await fetch(`${base}/v1/models?limit=1000`, {
        headers: {
          'x-api-key': params.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          ...(params.headers ?? {}),
        },
        signal: params.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, models: [], error: `${res.status}: ${truncate(text, 160)}` };
      }
      const json = (await res.json().catch(() => ({}))) as {
        data?: Array<{ id?: string; display_name?: string }>;
      };
      const models = (json.data ?? [])
        .filter((m): m is { id: string; display_name?: string } => typeof m.id === 'string')
        .map((m) => ({ id: m.id, ...(m.display_name ? { displayName: m.display_name } : {}) }));
      return { ok: true, models };
    } catch (error) {
      return { ok: false, models: [], error: (error as Error).message };
    }
  }

  private finalize(blocks: Map<number, Accum>): AssistantBlock[] {
    return [...blocks.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, accum]): AssistantBlock => {
        if (accum.kind === 'tool_use') {
          let input: Record<string, unknown> = {};
          try {
            input = accum.partialJson ? JSON.parse(accum.partialJson) : {};
          } catch {
            input = {};
          }
          return {
            kind: 'tool_use',
            toolUse: { id: accum.id ?? '', name: accum.name ?? '', input },
          };
        }
        return { kind: 'text', text: accum.text };
      });
  }

  private aborted(blocks: Map<number, Accum>, usage: AssistantTurn['usage']): AssistantTurn {
    return { blocks: this.finalize(blocks), usage, stopReason: 'aborted' };
  }

  private error(message: string): AssistantTurn {
    return {
      blocks: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'error',
      errorMessage: message,
    };
  }
}
