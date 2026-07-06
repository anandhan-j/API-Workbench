import { Agent, fetch as undiciFetch } from 'undici';
import type { SseOpenRequest, SseOpenResult, SseStreamer } from './sse-port';

/**
 * The production SSE streamer over undici's streaming `fetch`. `verifySsl`
 * mirrors the HTTP transport: when it returns false, requests go through a
 * dispatcher that accepts self-signed/invalid certificates.
 */
export function createSseStreamer(verifySsl: () => boolean = () => true): SseStreamer {
  let insecureAgent: Agent | undefined;
  const getInsecureAgent = (): Agent => {
    if (!insecureAgent) insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
    return insecureAgent;
  };
  return {
    async open(request: SseOpenRequest): Promise<SseOpenResult> {
      const response = await undiciFetch(request.url, {
        method: request.method,
        headers: { Accept: 'text/event-stream', ...request.headers },
        ...(request.method === 'POST' && request.body ? { body: request.body } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
        ...(verifySsl() === false ? { dispatcher: getInsecureAgent() } : {}),
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const body = response.body;
      async function* chunks(): AsyncIterable<string> {
        if (!body) return;
        const decoder = new TextDecoder();
        for await (const chunk of body as AsyncIterable<Uint8Array>) {
          yield decoder.decode(chunk, { stream: true });
        }
        const tail = decoder.decode();
        if (tail) yield tail;
      }

      return { status: response.status, headers, chunks: chunks() };
    },
  };
}
