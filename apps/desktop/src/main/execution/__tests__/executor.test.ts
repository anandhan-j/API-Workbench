// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ExecutionEngine, type PreparedRequest } from '../executor';
import type { HttpTransport, TransportRequest, TransportResponse } from '../transport';

function resp(over: Partial<TransportResponse> = {}): TransportResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from('{"a":1}'),
    ...over,
  };
}

class ScriptedTransport implements HttpTransport {
  calls: TransportRequest[] = [];
  constructor(private readonly steps: Array<TransportResponse | (() => never)>) {}
  send(req: TransportRequest): Promise<TransportResponse> {
    this.calls.push(req);
    const step = this.steps.shift();
    if (!step) return Promise.resolve(resp());
    if (typeof step === 'function') {
      try {
        step();
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.resolve(step as TransportResponse);
  }
}

const prepared: PreparedRequest = { method: 'GET', url: 'https://api.test/x', headers: {} };

describe('ExecutionEngine', () => {
  it('returns a classified, timed JSON response', async () => {
    const engine = new ExecutionEngine(new ScriptedTransport([resp()]));
    const r = await engine.execute(prepared);
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.bodyKind).toBe('json');
    expect(r.prettyBody).toContain('"a": 1');
    expect(r.sizeBytes).toBeGreaterThan(0);
    expect(r.timings.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('classifies html and binary bodies', async () => {
    const html = new ExecutionEngine(
      new ScriptedTransport([resp({ headers: { 'content-type': 'text/html' }, body: Buffer.from('<h1>hi</h1>') })]),
    );
    expect((await html.execute(prepared)).bodyKind).toBe('html');

    const bin = new ExecutionEngine(
      new ScriptedTransport([resp({ headers: { 'content-type': 'image/png' }, body: Buffer.from([1, 2, 3, 4]) })]),
    );
    const r = await bin.execute(prepared);
    expect(r.bodyKind).toBe('binary');
    expect(r.body).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'));
  });

  it('retries on 5xx then succeeds', async () => {
    const t = new ScriptedTransport([resp({ status: 503 }), resp({ status: 503 }), resp({ status: 200 })]);
    const r = await new ExecutionEngine(t).execute(prepared, { maxRetries: 2, retryBackoffMs: 1 });
    expect(r.status).toBe(200);
    expect(r.retries).toBe(2);
    expect(t.calls).toHaveLength(3);
  });

  it('retries on network error then succeeds', async () => {
    const t = new ScriptedTransport([
      () => {
        throw new Error('ECONNRESET');
      },
      resp({ status: 200 }),
    ]);
    const r = await new ExecutionEngine(t).execute(prepared, { maxRetries: 1, retryBackoffMs: 1 });
    expect(r.ok).toBe(true);
    expect(r.retries).toBe(1);
  });

  it('reports an error after exhausting retries', async () => {
    const t = new ScriptedTransport([
      () => {
        throw new Error('boom');
      },
    ]);
    const r = await new ExecutionEngine(t).execute(prepared, { maxRetries: 0 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.error).toContain('boom');
  });

  it('times out a hanging request', async () => {
    const hanging: HttpTransport = {
      send: (req) =>
        new Promise((_resolve, reject) => {
          req.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    };
    const r = await new ExecutionEngine(hanging).execute(prepared, { timeoutMs: 20 });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('follows redirects and records them', async () => {
    const t = new ScriptedTransport([
      resp({ status: 301, headers: { location: 'https://api.test/y' }, body: Buffer.from('') }),
      resp({ status: 200 }),
    ]);
    const r = await new ExecutionEngine(t).execute(prepared, { followRedirects: true });
    expect(r.status).toBe(200);
    expect(r.redirects).toEqual(['https://api.test/y']);
    expect(t.calls[1].url).toBe('https://api.test/y');
  });

  it('cancels when the external signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const r = await new ExecutionEngine(new ScriptedTransport([resp()])).execute(
      prepared,
      {},
      controller.signal,
    );
    expect(r.cancelled).toBe(true);
    expect(r.error).toContain('cancelled');
  });
});
