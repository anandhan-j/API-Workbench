import type { BodyKind } from '@shared/execution';
import type { ProtocolResponse, StreamEvent, StreamProtocolExtras } from '@shared/protocol';

/** The accumulated outcome of a one-shot stream collection. */
export interface StreamCollection {
  type: string;
  events: StreamEvent[];
  startedAt: number;
  totalMs: number;
  /** Handshake headers to surface in the generic metadata table (SSE). */
  metadata?: Record<string, string>;
  closeCode?: number;
  closeReason?: string;
  /** Stopped at a maxEvents/durationMs limit rather than server close. */
  truncated?: boolean;
  /** Handshake or connection failure before/while collecting. */
  error?: string;
  cancelled?: boolean;
  /** Connection reached the open state (handshake succeeded). */
  connected: boolean;
}

/** Parses a received frame's data as JSON when possible; else keeps the text. */
function coerce(data: string): unknown {
  const trimmed = data.trim();
  if (!trimmed) return data;
  if (!/^[[{"]|^-?\d|^(true|false|null)$/.test(trimmed)) return data;
  try {
    return JSON.parse(trimmed);
  } catch {
    return data;
  }
}

/**
 * Builds the one-shot {@link ProtocolResponse} for a WebSocket/SSE collection.
 * The body is a JSON array of received message data (JSON-parsed per message
 * where possible) so existing jsonpath/regex extraction works; the full
 * directional timeline lives in {@link StreamProtocolExtras}.
 */
export function buildStreamResponse(collection: StreamCollection): ProtocolResponse {
  const received = collection.events.filter((e) => e.direction === 'received');
  const body = JSON.stringify(received.map((e) => coerce(e.data)), null, 2);
  const extras: StreamProtocolExtras = {
    events: collection.events,
    ...(collection.closeCode !== undefined ? { closeCode: collection.closeCode } : {}),
    ...(collection.closeReason ? { closeReason: collection.closeReason } : {}),
    ...(collection.truncated ? { truncated: true } : {}),
  };

  const failed = Boolean(collection.error);
  // A cancelled or never-connected collection is not a success.
  const ok = !failed && collection.connected && !collection.cancelled;
  const bodyKind: BodyKind = 'json';

  const label = collection.cancelled
    ? 'Cancelled'
    : failed
      ? 'Error'
      : collection.closeCode !== undefined
        ? `Closed ${collection.closeCode} · ${received.length} message${received.length === 1 ? '' : 's'}`
        : `${received.length} message${received.length === 1 ? '' : 's'}${collection.truncated ? ' (truncated)' : ''}`;

  return {
    type: collection.type,
    ok,
    summary: {
      label,
      tone: collection.cancelled ? 'info' : ok ? 'success' : 'error',
    },
    metadata: collection.metadata ?? {},
    body,
    bodyKind,
    prettyBody: body,
    contentType: 'application/json',
    sizeBytes: Buffer.byteLength(body, 'utf8'),
    timings: { startedAt: collection.startedAt, totalMs: collection.totalMs },
    ...(collection.error ? { error: collection.error } : {}),
    ...(collection.cancelled ? { cancelled: true } : {}),
    protocol: extras,
  };
}
