import type { ExecutionResponse, ExecutionOptions } from '@shared/execution';
import type { HttpTransport, TransportResponse } from './transport';
import { classifyBody } from './classify';

export interface PreparedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
}

const DEFAULTS: ExecutionOptions = {
  timeoutMs: 30_000,
  maxRetries: 0,
  retryBackoffMs: 200,
  followRedirects: true,
  maxRedirects: 5,
};

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('cancelled'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('cancelled'));
    });
  });
}

/**
 * Orchestrates a single logical request: per-attempt timeout, retry with
 * backoff, redirect following, response classification, timing metrics, and
 * cooperative cancellation — all on top of an injectable {@link HttpTransport}.
 */
export class ExecutionEngine {
  constructor(private readonly transport: HttpTransport) {}

  async execute(
    prepared: PreparedRequest,
    options?: Partial<ExecutionOptions>,
    externalSignal?: AbortSignal,
  ): Promise<ExecutionResponse> {
    const opts = { ...DEFAULTS, ...options };
    const startedAt = Date.now();
    const t0 = Date.now();
    const redirects: string[] = [];
    let attempt = 0;
    let lastError: unknown;

    for (;;) {
      if (externalSignal?.aborted) return this.cancelled(startedAt, t0, redirects, attempt);
      try {
        const resp = await this.sendWithRedirects(prepared, opts, externalSignal, redirects);
        if (resp.status >= 500 && attempt < opts.maxRetries) {
          attempt += 1;
          await delay(opts.retryBackoffMs * attempt, externalSignal);
          continue;
        }
        return this.build(resp, startedAt, t0, redirects, attempt);
      } catch (error) {
        if (externalSignal?.aborted) return this.cancelled(startedAt, t0, redirects, attempt);
        lastError = error;
        if (attempt < opts.maxRetries) {
          attempt += 1;
          try {
            await delay(opts.retryBackoffMs * attempt, externalSignal);
          } catch {
            return this.cancelled(startedAt, t0, redirects, attempt);
          }
          continue;
        }
        return this.error(lastError, startedAt, t0, redirects, attempt);
      }
    }
  }

  private async sendWithRedirects(
    prepared: PreparedRequest,
    opts: ExecutionOptions,
    externalSignal: AbortSignal | undefined,
    redirects: string[],
  ): Promise<TransportResponse> {
    let current = prepared;
    let count = 0;
    for (;;) {
      const resp = await this.sendOnce(current, opts.timeoutMs, externalSignal);
      const headers = lowerHeaders(resp.headers);
      const location = headers['location'];
      if (opts.followRedirects && REDIRECT_CODES.has(resp.status) && location && count < opts.maxRedirects) {
        count += 1;
        const next = new URL(location, current.url).toString();
        redirects.push(next);
        const toGet = resp.status === 303;
        current = {
          method: toGet ? 'GET' : current.method,
          url: next,
          headers: current.headers,
          ...(toGet ? {} : current.body ? { body: current.body } : {}),
        };
        continue;
      }
      return resp;
    }
  }

  private async sendOnce(
    req: PreparedRequest,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<TransportResponse> {
    const ac = new AbortController();
    const onExternalAbort = (): void => ac.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await this.transport.send({
        method: req.method,
        url: req.url,
        headers: req.headers,
        ...(req.body ? { body: req.body } : {}),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private build(
    resp: TransportResponse,
    startedAt: number,
    t0: number,
    redirects: string[],
    retries: number,
  ): ExecutionResponse {
    const headers = lowerHeaders(resp.headers);
    const contentType = headers['content-type'] ?? '';
    const { bodyKind, text, prettyBody } = classifyBody(contentType, resp.body);
    return {
      ok: resp.status >= 200 && resp.status < 400,
      status: resp.status,
      statusText: resp.statusText,
      headers,
      body: text,
      bodyKind,
      ...(prettyBody ? { prettyBody } : {}),
      contentType,
      sizeBytes: resp.body.length,
      timings: { startedAt, totalMs: Math.max(0, Date.now() - t0) },
      redirects,
      retries,
    };
  }

  private error(
    err: unknown,
    startedAt: number,
    t0: number,
    redirects: string[],
    retries: number,
  ): ExecutionResponse {
    return {
      ok: false,
      status: 0,
      statusText: '',
      headers: {},
      body: '',
      bodyKind: 'empty',
      contentType: '',
      sizeBytes: 0,
      timings: { startedAt, totalMs: Math.max(0, Date.now() - t0) },
      redirects,
      retries,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  private cancelled(
    startedAt: number,
    t0: number,
    redirects: string[],
    retries: number,
  ): ExecutionResponse {
    return {
      ok: false,
      status: 0,
      statusText: '',
      headers: {},
      body: '',
      bodyKind: 'empty',
      contentType: '',
      sizeBytes: 0,
      timings: { startedAt, totalMs: Math.max(0, Date.now() - t0) },
      redirects,
      retries,
      error: 'Request cancelled',
      cancelled: true,
    };
  }
}
