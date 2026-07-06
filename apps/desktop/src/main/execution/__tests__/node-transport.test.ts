// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { FetchTransport } from '../node-transport';

/**
 * Drives the production transport against a real HTTPS server presenting a
 * throwaway self-signed certificate (valid for 127.0.0.1, so hostname matches —
 * the only reason verification fails is the untrusted issuer). This proves the
 * "verify SSL certificates" toggle actually reaches the TLS stack.
 */

const KEY = ``;

const CERT = `
`;

describe('FetchTransport TLS verification', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = createServer({ key: KEY, cert: CERT }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('secure-ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    url = `https://127.0.0.1:${port}/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('rejects a self-signed certificate when verification is on', async () => {
    const transport = new FetchTransport(() => true);
    await expect(transport.send({ method: 'GET', url, headers: {} })).rejects.toThrow();
  });

  it('accepts a self-signed certificate when verification is off', async () => {
    const transport = new FetchTransport(() => false);
    const res = await transport.send({ method: 'GET', url, headers: {} });
    expect(res.status).toBe(200);
    expect(res.body.toString('utf8')).toBe('secure-ok');
  });

  it('verifies certificates by default (no flag supplied)', async () => {
    const transport = new FetchTransport();
    await expect(transport.send({ method: 'GET', url, headers: {} })).rejects.toThrow();
  });
});
