/**
 * Port over an SSE stream open (ADR-0009). Returns the handshake status and
 * headers plus an async iterable of decoded text chunks; the provider feeds
 * those through {@link SseParser}. Isolating the transport lets tests stream
 * scripted chunks without a real server.
 */
export interface SseOpenRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface SseOpenResult {
  status: number;
  headers: Record<string, string>;
  /** Decoded text chunks of the `text/event-stream` body. */
  chunks: AsyncIterable<string>;
}

export interface SseStreamer {
  open(request: SseOpenRequest): Promise<SseOpenResult>;
}
