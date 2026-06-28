/**
 * Transport abstraction for the execution engine. The production implementation
 * (`node-transport.ts`) uses `fetch`/undici; tests inject a fake so retries,
 * timeouts, redirects, cancellation, and classification are verifiable offline.
 */
export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  signal?: AbortSignal;
}

export interface TransportResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
}

export interface HttpTransport {
  send(req: TransportRequest): Promise<TransportResponse>;
}
