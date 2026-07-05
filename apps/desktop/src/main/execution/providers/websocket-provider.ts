import {
  WEBSOCKET_REQUEST_TYPE,
  WebSocketPayload,
  type ProtocolResponse,
  type StreamEvent,
} from '@shared/protocol';
import { deepSubstitute } from '@shared/substitute';
import type { MainRequestTypeProvider } from '../../plugins/registries/request-type-registry';
import type { WsConnection, WsConnector } from '../streams/ws-port';
import { createWsConnector } from '../streams/ws-connector';
import { buildStreamResponse, type StreamCollection } from '../streams/collect';

/**
 * The built-in WebSocket request-type provider in one-shot collect mode
 * (ADR-0009): connect, send the scripted messages, collect frames until the
 * server closes or a `maxEvents`/`durationMs` limit is hit, then return a
 * single {@link ProtocolResponse}. Interactive send/receive is Phase 7.
 *
 * Auth `headers` (+ cookies as a `Cookie` header) ride on the handshake;
 * `query` is appended to the URL. Body-hash schemes (Digest/SigV4) don't apply.
 */
export function createWebSocketProvider(
  connector: WsConnector = createWsConnector(),
): MainRequestTypeProvider {
  return {
    type: WEBSOCKET_REQUEST_TYPE,
    payloadSchema: WebSocketPayload,
    resolveVariables: (payload, evaluate) => deepSubstitute(payload, evaluate),
    buildApplyContext: (payload) => {
      const p = payload as WebSocketPayload;
      return { url: p.url.replace(/^ws/, 'http') };
    },
    summarize: (payload) => {
      const p = payload as WebSocketPayload;
      return { badge: 'WS', target: p.url };
    },
    execute(payload, ctx): Promise<ProtocolResponse> {
      const p = payload as WebSocketPayload;
      const startedAt = Date.now();
      const events: StreamEvent[] = [];
      const timers: ReturnType<typeof setTimeout>[] = [];
      let connection: WsConnection | undefined;
      let settled = false;
      let connected = false;

      // Auth headers + cookies + query on the handshake.
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

      return new Promise<ProtocolResponse>((resolve) => {
        const finish = (partial: Partial<StreamCollection>): void => {
          if (settled) return;
          settled = true;
          for (const timer of timers) clearTimeout(timer);
          try {
            connection?.close(1000);
          } catch {
            // best-effort close
          }
          const collection: StreamCollection = {
            type: WEBSOCKET_REQUEST_TYPE,
            events,
            startedAt,
            totalMs: Date.now() - startedAt,
            connected: partial.connected ?? false,
            ...partial,
          };
          resolve(buildStreamResponse(collection));
        };

        const onAbort = (): void => finish({ cancelled: true, connected });
        if (ctx.signal) {
          if (ctx.signal.aborted) {
            finish({ cancelled: true });
            return;
          }
          ctx.signal.addEventListener('abort', onAbort, { once: true });
        }

        // Overall session cap — `connected` reflects whether the socket opened.
        timers.push(
          setTimeout(() => finish({ truncated: true, connected }), p.collect.durationMs),
        );

        try {
          connection = connector.connect(url, { headers, protocols: p.subprotocols });
        } catch (err) {
          finish({ error: err instanceof Error ? err.message : String(err) });
          return;
        }

        connection.onOpen(() => {
          connected = true;
          events.push({ at: Date.now(), direction: 'info', kind: 'open', data: 'connected' });
          for (const message of p.messages) {
            timers.push(
              setTimeout(() => {
                if (settled) return;
                try {
                  connection?.send(message.data);
                  events.push({ at: Date.now(), direction: 'sent', kind: 'text', data: message.data });
                } catch {
                  // ignore send failures on a closing socket
                }
              }, message.delayMs),
            );
          }
        });

        connection.onMessage((data: string) => {
          if (settled) return;
          events.push({ at: Date.now(), direction: 'received', kind: 'text', data });
          const received = events.filter((e) => e.direction === 'received').length;
          if (received >= p.collect.maxEvents) {
            finish({ truncated: true, connected });
          }
        });

        connection.onClose((info) => {
          finish({
            connected,
            closeCode: info.code,
            ...(info.reason ? { closeReason: info.reason } : {}),
          });
        });

        connection.onError((error) => {
          events.push({ at: Date.now(), direction: 'error', kind: 'error', data: error.message });
          finish({ error: error.message });
        });
      });
    },
  };
}
