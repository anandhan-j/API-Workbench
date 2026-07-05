// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSseStreamer } from '../streams/sse-stream';

/** Drives the production SSE streamer against a real event-stream server. */
describe('createSseStreamer (real server)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/notfound') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'x-demo': 'yes' });
      res.write('data: one\n\n');
      res.write('event: tick\ndata: two\n\n');
      if (req.url === '/hang') return; // keep the connection open for the abort test
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function collect(iter: AsyncIterable<string>): Promise<string> {
    let out = '';
    for await (const chunk of iter) out += chunk;
    return out;
  }

  it('returns the handshake status/headers and streams the body chunks', async () => {
    const result = await createSseStreamer(() => true).open({
      url: `${base}/events`,
      method: 'GET',
      headers: {},
    });
    expect(result.status).toBe(200);
    expect(result.headers['x-demo']).toBe('yes');
    const body = await collect(result.chunks);
    expect(body).toContain('data: one');
    expect(body).toContain('event: tick');
  });

  it('reports a non-2xx handshake status', async () => {
    const result = await createSseStreamer(() => true).open({
      url: `${base}/notfound`,
      method: 'GET',
      headers: {},
    });
    expect(result.status).toBe(404);
  });

  it('stops streaming when the signal aborts', async () => {
    const controller = new AbortController();
    const result = await createSseStreamer(() => true).open({
      url: `${base}/hang`,
      method: 'GET',
      headers: {},
      signal: controller.signal,
    });
    const chunks: string[] = [];
    const drain = (async () => {
      try {
        for await (const chunk of result.chunks) {
          chunks.push(chunk);
          controller.abort();
        }
      } catch {
        // aborted read rejects; that's the stop signal
      }
    })();
    await drain;
    expect(chunks.join('')).toContain('data: one');
  });
});
