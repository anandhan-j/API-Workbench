import type { HttpTransport, TransportRequest, TransportResponse } from './transport';

/**
 * Production transport using the runtime `fetch` (undici). Redirects are handled
 * manually by the engine (`redirect: 'manual'`) so they can be reported and
 * bounded. Note: client-certificate (mTLS) wiring requires a custom undici
 * Agent and is layered in during packaging (Phase 18).
 */
export class FetchTransport implements HttpTransport {
  async send(req: TransportRequest): Promise<TransportResponse> {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.body ? { body: new Uint8Array(req.body) } : {}),
      redirect: 'manual',
      ...(req.signal ? { signal: req.signal } : {}),
    });
    const body = Buffer.from(await res.arrayBuffer());
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { status: res.status, statusText: res.statusText, headers, body };
  }
}
