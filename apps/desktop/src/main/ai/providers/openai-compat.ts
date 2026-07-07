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

const DEFAULT_BASE = 'https://api.openai.com/v1';

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

/** Translates the neutral history into OpenAI chat-completions messages. */
function toOpenAiMessages(system: string, messages: NeutralMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text });
    } else if (message.role === 'assistant') {
      const text = message.blocks
        .filter((b) => b.kind === 'text')
        .map((b) => b.text ?? '')
        .join('');
      const toolCalls = message.blocks
        .filter((b) => b.kind === 'tool_use' && b.toolUse)
        .map(
          (b): OpenAiToolCall => ({
            id: b.toolUse!.id,
            type: 'function',
            function: { name: b.toolUse!.name, arguments: JSON.stringify(b.toolUse!.input) },
          }),
        );
      out.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    } else {
      for (const result of message.results) {
        out.push({ role: 'tool', tool_call_id: result.toolUseId, content: result.content });
      }
    }
  }
  return out;
}

/** In-progress tool call accumulated across streamed deltas, keyed by index. */
interface ToolAccum {
  id: string;
  name: string;
  args: string;
}

/**
 * OpenAI-compatible chat-completions adapter (raw SSE over `fetch`). One adapter
 * serves OpenAI, DeepSeek, Groq, OpenRouter, and local Ollama — the only
 * difference is the configured `baseUrl` and key.
 */
export class OpenAiCompatProvider implements AiProvider {
  async streamTurn(params: StreamTurnParams, cb: StreamCallbacks): Promise<AssistantTurn> {
    const base = params.baseUrl || DEFAULT_BASE;
    const usage = { inputTokens: 0, outputTokens: 0 };
    let text = '';
    const toolCalls = new Map<number, ToolAccum>();
    let sawToolCall = false;

    let res: Response;
    try {
      res = await fetchWithRetry(
        `${base}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${params.apiKey}`,
            ...(params.headers ?? {}),
          },
          body: JSON.stringify({
            model: params.model,
            stream: true,
            stream_options: { include_usage: true },
            messages: toOpenAiMessages(params.system, params.messages),
            ...(params.tools.length
              ? {
                  tools: params.tools.map((t) => ({
                    type: 'function',
                    function: { name: t.name, description: t.description, parameters: t.parameters },
                  })),
                }
              : {}),
          }),
        },
        params.signal,
      );
    } catch (error) {
      if (params.signal?.aborted) return this.aborted(text, toolCalls, usage, sawToolCall);
      return this.error(`Request failed: ${(error as Error).message}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return this.error(formatApiError('Provider', res.status, body));
    }

    try {
      for await (const raw of readSse(res)) {
        const event = raw as {
          choices?: Array<{
            delta?: { content?: string; tool_calls?: Array<Record<string, unknown>> };
            finish_reason?: string | null;
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        if (event.usage) {
          usage.inputTokens = event.usage.prompt_tokens ?? usage.inputTokens;
          usage.outputTokens = event.usage.completion_tokens ?? usage.outputTokens;
        }
        const choice = event.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) {
          text += delta.content;
          cb.onTextDelta(delta.content);
        }
        for (const call of delta?.tool_calls ?? []) {
          sawToolCall = true;
          const index = (call['index'] as number) ?? 0;
          const accum = toolCalls.get(index) ?? { id: '', name: '', args: '' };
          if (call['id']) accum.id = call['id'] as string;
          const fn = call['function'] as { name?: string; arguments?: string } | undefined;
          if (fn?.name) accum.name = fn.name;
          if (fn?.arguments) accum.args += fn.arguments;
          toolCalls.set(index, accum);
        }
      }
    } catch (error) {
      if (params.signal?.aborted) return this.aborted(text, toolCalls, usage, sawToolCall);
      return this.error(`Stream failed: ${(error as Error).message}`);
    }

    return {
      blocks: this.finalize(text, toolCalls),
      usage,
      stopReason: sawToolCall ? 'tool_use' : 'end',
    };
  }

  async verify(params: VerifyParams): Promise<VerifyProviderResult> {
    const base = params.baseUrl || DEFAULT_BASE;
    try {
      const res = await fetch(`${base}/models`, {
        headers: { authorization: `Bearer ${params.apiKey}`, ...(params.headers ?? {}) },
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
      const res = await fetch(`${base}/models`, {
        headers: { authorization: `Bearer ${params.apiKey}`, ...(params.headers ?? {}) },
        signal: params.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, models: [], error: `${res.status}: ${truncate(text, 160)}` };
      }
      const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
      const models = (json.data ?? [])
        .filter((m): m is { id: string } => typeof m.id === 'string')
        .map((m) => ({ id: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
      return { ok: true, models };
    } catch (error) {
      return { ok: false, models: [], error: (error as Error).message };
    }
  }

  private finalize(text: string, toolCalls: Map<number, ToolAccum>): AssistantBlock[] {
    const blocks: AssistantBlock[] = [];
    if (text) blocks.push({ kind: 'text', text });
    for (const [, accum] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
      let input: Record<string, unknown> = {};
      try {
        input = accum.args ? JSON.parse(accum.args) : {};
      } catch {
        input = {};
      }
      blocks.push({ kind: 'tool_use', toolUse: { id: accum.id, name: accum.name, input } });
    }
    return blocks;
  }

  private aborted(
    text: string,
    toolCalls: Map<number, ToolAccum>,
    usage: AssistantTurn['usage'],
    sawToolCall: boolean,
  ): AssistantTurn {
    return { blocks: this.finalize(text, toolCalls), usage, stopReason: sawToolCall ? 'tool_use' : 'aborted' };
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
