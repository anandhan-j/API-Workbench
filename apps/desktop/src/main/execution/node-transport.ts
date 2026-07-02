import { Agent, fetch as undiciFetch } from 'undici';
import type { HttpTransport, TransportRequest, TransportResponse } from './transport';

/**
 * Production transport using undici's `fetch`. Redirects are handled manually by
 * the engine (`redirect: 'manual'`) so they can be reported and bounded.
 *
 * TLS server-certificate validation is honoured via `verifySsl`: when it returns
 * false, the request goes through a dispatcher that accepts self-signed / invalid
 * certificates. The flag is read on every send so toggling the global preference
 * takes effect on the next request without rebuilding the transport.
 *
 * Note: client-certificate (mTLS) wiring — the `AuthArtifacts.tls` material — is
 * still layered in during packaging (Phase 18).
 */
export class FetchTransport implements HttpTransport {
  private insecureAgent: Agent | undefined;

  /** @param verifySsl reads the current "verify TLS certificates" setting. */
  constructor(private readonly verifySsl: () => boolean = () => true) {}

  async send(req: TransportRequest): Promise<TransportResponse> {
    const res = await undiciFetch(req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.body ? { body: new Uint8Array(req.body) } : {}),
      redirect: 'manual',
      ...(req.signal ? { signal: req.signal } : {}),
      ...(this.verifySsl() === false ? { dispatcher: this.getInsecureAgent() } : {}),
    });
    const body = Buffer.from(await res.arrayBuffer());
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { status: res.status, statusText: res.statusText, headers, body };
  }

  /** Lazily built and reused so we don't leak a dispatcher per request. */
  private getInsecureAgent(): Agent {
    if (!this.insecureAgent) {
      this.insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
    }
    return this.insecureAgent;
  }
}
