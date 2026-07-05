// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { createWsConnector } from '../streams/ws-connector';
import type { WsConnection } from '../streams/ws-port';

/**
 * Drives the production WebSocket connector against a real `ws` server on an
 * ephemeral port (mirrors node-transport.test.ts's real-server approach).
 */
describe('createWsConnector (real server)', () => {
  let wss: WebSocketServer;
  let url: string;
  let lastHeaders: Record<string, string | string[] | undefined> = {};

  beforeAll(async () => {
    wss = new WebSocketServer({ port: 0 });
    wss.on('connection', (socket, req) => {
      lastHeaders = req.headers;
      socket.on('message', (data) => {
        const text = data.toString();
        // The port only sends text frames, so the server initiates the binary
        // one on request to exercise the connector's binary→base64 decode.
        if (text === 'go-binary') socket.send(Buffer.from([1, 2, 3]), { binary: true });
        else socket.send(`echo:${text}`);
      });
    });
    await new Promise<void>((r) => wss.on('listening', () => r()));
    url = `ws://127.0.0.1:${(wss.address() as { port: number }).port}`;
  });

  afterAll(() => wss.close());

  function connect(): Promise<{ conn: WsConnection; messages: string[]; closeInfo: Promise<{ code: number }> }> {
    return new Promise((resolve, reject) => {
      const messages: string[] = [];
      const conn = createWsConnector().connect(url, { headers: { 'X-Test': 'yes' }, protocols: [] });
      const closeInfo = new Promise<{ code: number }>((res) => conn.onClose(res));
      conn.onMessage((data) => messages.push(data));
      conn.onError(reject);
      conn.onOpen(() => resolve({ conn, messages, closeInfo }));
    });
  }

  it('opens, sends the handshake headers, echoes a text frame, and closes cleanly', async () => {
    const { conn, messages, closeInfo } = await connect();
    expect(lastHeaders['x-test']).toBe('yes');
    conn.send('ping');
    await new Promise((r) => setTimeout(r, 30));
    expect(messages).toContain('echo:ping');
    conn.close(1000);
    const info = await closeInfo;
    expect(info.code).toBe(1000);
  });

  it('decodes a binary frame as base64', async () => {
    const { conn, messages } = await connect();
    conn.send('go-binary');
    await new Promise((r) => setTimeout(r, 30));
    conn.close(1000);
    expect(messages).toContain(Buffer.from([1, 2, 3]).toString('base64'));
  });
});
