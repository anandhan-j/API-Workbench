// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { StreamProtocolExtras } from '@shared/protocol';
import { ExecutionService } from '../execution-service';
import { createSseProvider } from '../providers/sse-provider';
import type { SseOpenRequest, SseStreamer } from '../streams/sse-port';
import { RequestTypeRegistry } from '../../plugins/registries/request-type-registry';
import { FetchTransport } from '../node-transport';

/** A streamer that yields scripted chunks, honoring the abort signal. */
function fakeStreamer(
  chunks: string[],
  opts: { status?: number; headers?: Record<string, string>; delayMs?: number } = {},
): SseStreamer & { last?: SseOpenRequest } {
  const streamer: SseStreamer & { last?: SseOpenRequest } = {
    async open(request) {
      streamer.last = request;
      async function* gen(): AsyncIterable<string> {
        for (const chunk of chunks) {
          if (request.signal?.aborted) return;
          if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
          if (request.signal?.aborted) return;
          yield chunk;
        }
        // Keep the stream open until aborted so duration/maxEvents can stop it.
        if (opts.delayMs) {
          await new Promise<void>((resolve) => {
            if (request.signal?.aborted) return resolve();
            request.signal?.addEventListener('abort', () => resolve(), { once: true });
          });
        }
      }
      return {
        status: opts.status ?? 200,
        headers: opts.headers ?? { 'content-type': 'text/event-stream' },
        chunks: gen(),
      };
    },
  };
  return streamer;
}

const vars: Record<string, string> = { host: 'sse.test', token: 'secret' };
const evaluate = (tpl: string): string => tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');

function service(streamer: SseStreamer): ExecutionService {
  return new ExecutionService(new FetchTransport(() => true), {
    evaluate,
    requestTypes: new RequestTypeRegistry([createSseProvider(streamer)]),
  });
}

function envelope(payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type: 'sse', payload: { url: 'https://sse.test/stream', ...payload }, ...extra };
}

describe('createSseProvider (collect mode)', () => {
  it('collects events until the stream ends', async () => {
    const streamer = fakeStreamer(['data: 1\n\n', 'event: tick\ndata: 2\n\n']);
    const response = await service(streamer).run(envelope({ url: 'https://{{host}}/stream' }));
    expect(streamer.last?.url).toBe('https://sse.test/stream');
    expect(response.ok).toBe(true);
    expect(response.type).toBe('sse');
    expect(JSON.parse(response.body)).toEqual([1, 2]);
    const extras = StreamProtocolExtras.parse(response.protocol);
    expect(extras.events.map((e) => e.kind)).toEqual(['message', 'tick']);
  });

  it('surfaces handshake headers as metadata', async () => {
    const streamer = fakeStreamer(['data: x\n\n'], {
      headers: { 'content-type': 'text/event-stream', 'x-id': '9' },
    });
    const response = await service(streamer).run(envelope({}));
    expect(response.metadata['x-id']).toBe('9');
  });

  it('truncates at maxEvents', async () => {
    const streamer = fakeStreamer(['data: a\n\ndata: b\n\ndata: c\n\n']);
    const response = await service(streamer).run(
      envelope({ collect: { maxEvents: 2, durationMs: 10_000 } }),
    );
    expect(JSON.parse(response.body)).toEqual(['a', 'b']);
    expect(StreamProtocolExtras.parse(response.protocol).truncated).toBe(true);
  });

  it('fails on a non-2xx handshake', async () => {
    const streamer = fakeStreamer([], { status: 404 });
    const response = await service(streamer).run(envelope({}));
    expect(response.ok).toBe(false);
    expect(response.error).toContain('404');
  });

  it('stops at durationMs when the server keeps the stream open', async () => {
    const streamer = fakeStreamer(['data: a\n\n'], { delayMs: 5 });
    const response = await service(streamer).run(
      envelope({ collect: { maxEvents: 50, durationMs: 25 } }),
    );
    expect(response.ok).toBe(true);
    expect(StreamProtocolExtras.parse(response.protocol).truncated).toBe(true);
    expect(JSON.parse(response.body)).toEqual(['a']);
  });

  it('POSTs a body and applies auth headers', async () => {
    const streamer = fakeStreamer(['data: ok\n\n']);
    await service(streamer).run(
      envelope({ method: 'POST', body: 'q=1' }, { auth: { type: 'bearer', token: '{{token}}' } }),
    );
    expect(streamer.last?.method).toBe('POST');
    expect(streamer.last?.body).toBe('q=1');
    expect(streamer.last?.headers.Authorization).toBe('Bearer secret');
  });
});
