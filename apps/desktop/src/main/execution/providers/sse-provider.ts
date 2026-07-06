import {
  SSE_REQUEST_TYPE,
  SsePayload,
  type ProtocolResponse,
  type StreamEvent,
} from '@shared/protocol';
import { deepSubstitute } from '@shared/substitute';
import type { MainRequestTypeProvider } from '../../plugins/registries/request-type-registry';
import type { SseStreamer } from '../streams/sse-port';
import { createSseStreamer } from '../streams/sse-stream';
import { SseParser } from '../streams/sse-parser';
import { buildStreamResponse, type StreamCollection } from '../streams/collect';

/**
 * The built-in Server-Sent Events request-type provider in one-shot collect
 * mode (ADR-0009): open the stream, collect events until the server ends it or
 * a `maxEvents`/`durationMs` limit is hit, then return a single
 * {@link ProtocolResponse}. Auth `headers` (+ cookies) ride on the request.
 */
export function createSseProvider(
  streamer: SseStreamer = createSseStreamer(),
): MainRequestTypeProvider {
  return {
    type: SSE_REQUEST_TYPE,
    payloadSchema: SsePayload,
    resolveVariables: (payload, evaluate) => deepSubstitute(payload, evaluate),
    buildApplyContext: (payload) => {
      const p = payload as SsePayload;
      return { method: p.method, url: p.url };
    },
    summarize: (payload) => {
      const p = payload as SsePayload;
      return { badge: 'SSE', target: p.url };
    },
    async execute(payload, ctx): Promise<ProtocolResponse> {
      const p = payload as SsePayload;
      const startedAt = Date.now();
      const events: StreamEvent[] = [];

      const headers: Record<string, string> = { ...p.headers, ...ctx.artifacts.headers };
      const cookiePairs = Object.entries(ctx.artifacts.cookies).map(([n, v]) => `${n}=${v}`);
      if (cookiePairs.length > 0) {
        headers['Cookie'] = [headers['Cookie'], ...cookiePairs].filter(Boolean).join('; ');
      }
      let url = p.url;
      const queryEntries = Object.entries(ctx.artifacts.query);
      if (queryEntries.length > 0) {
        const sep = url.includes('?') ? '&' : '?';
        url += sep + queryEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
      }

      // A dedicated controller lets durationMs and maxEvents stop the body
      // stream even when the caller passed no signal (or passed a shared one).
      const controller = new AbortController();
      const onOuterAbort = (): void => controller.abort();
      if (ctx.signal) {
        if (ctx.signal.aborted) controller.abort();
        else ctx.signal.addEventListener('abort', onOuterAbort, { once: true });
      }
      const durationTimer = setTimeout(() => controller.abort(), p.collect.durationMs);
      let truncated = false;

      const finish = (partial: Partial<StreamCollection>): ProtocolResponse => {
        clearTimeout(durationTimer);
        ctx.signal?.removeEventListener('abort', onOuterAbort);
        const collection: StreamCollection = {
          type: SSE_REQUEST_TYPE,
          events,
          startedAt,
          totalMs: Date.now() - startedAt,
          connected: partial.connected ?? false,
          ...(truncated ? { truncated: true } : {}),
          ...partial,
        };
        return buildStreamResponse(collection);
      };

      let handshakeHeaders: Record<string, string> = {};
      try {
        const result = await streamer.open({
          url,
          method: p.method,
          headers,
          ...(p.method === 'POST' && p.body ? { body: p.body } : {}),
          signal: controller.signal,
        });
        handshakeHeaders = result.headers;

        if (result.status < 200 || result.status >= 300) {
          controller.abort(); // release the undici body/socket instead of leaking it
          return finish({
            connected: false,
            metadata: handshakeHeaders,
            error: `SSE handshake failed with status ${result.status}`,
          });
        }

        const parser = new SseParser();
        for await (const chunk of result.chunks) {
          for (const event of parser.push(chunk)) {
            events.push({
              at: Date.now(),
              direction: 'received',
              kind: event.event,
              data: event.data,
            });
            const received = events.filter((e) => e.direction === 'received').length;
            if (received >= p.collect.maxEvents) {
              truncated = true;
              controller.abort();
              return finish({ connected: true, metadata: handshakeHeaders });
            }
          }
        }
        // The read loop ended. If our controller aborted it (durationMs, or a
        // caller cancel), classify accordingly; otherwise the server closed.
        if (controller.signal.aborted) {
          if (ctx.signal?.aborted) return finish({ connected: true, cancelled: true, metadata: handshakeHeaders });
          truncated = true;
          return finish({ connected: true, metadata: handshakeHeaders });
        }
        return finish({ connected: true, metadata: handshakeHeaders });
      } catch (err) {
        if (controller.signal.aborted) {
          const cancelled = ctx.signal?.aborted ?? false;
          if (cancelled) return finish({ connected: true, cancelled: true, metadata: handshakeHeaders });
          // durationMs or maxEvents aborted the read — a normal stop.
          truncated = true;
          return finish({ connected: true, metadata: handshakeHeaders });
        }
        return finish({
          connected: events.length > 0,
          metadata: handshakeHeaders,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
