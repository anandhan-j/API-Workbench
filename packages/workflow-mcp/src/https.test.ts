import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_CERT, TEST_KEY } from './__fixtures__/test-cert.js';
import { startHttpServer, type RunningHttpServer } from './http.js';
import { createServer } from './server.js';

const TOKEN = 'tls-token-xyz';

describe('startHttpServer over HTTPS', () => {
  let running: RunningHttpServer;
  let priorTlsReject: string | undefined;

  beforeAll(async () => {
    // Accept the self-signed test certificate for this test process only.
    priorTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    running = await startHttpServer({
      port: 0,
      token: TOKEN,
      createServer,
      tls: { cert: TEST_CERT, key: TEST_KEY },
    });
  });

  afterAll(async () => {
    await running.close();
    if (priorTlsReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = priorTlsReject;
  });

  it('reports an https URL', () => {
    expect(running.url).toMatch(/^https:\/\/127\.0\.0\.1:\d+\/mcp\?token=/);
  });

  it('serves over TLS and still enforces the token', async () => {
    const noToken = running.url.replace(/\?token=.*/, '');
    const rejected = await fetch(noToken, { method: 'GET' });
    expect(rejected.status).toBe(401);

    // A GET with the token but no session is a 400 (not 401) — proves TLS + auth both pass.
    const authed = await fetch(running.url, { method: 'GET' });
    expect(authed.status).toBe(400);
  });
});
