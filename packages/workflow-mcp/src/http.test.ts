import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startHttpServer, type RunningHttpServer } from './http.js';
import { createServer } from './server.js';

const TOKEN = 'test-token-abc123';

describe('startHttpServer (Streamable HTTP transport)', () => {
  let running: RunningHttpServer;

  beforeAll(async () => {
    running = await startHttpServer({ port: 0, token: TOKEN, createServer });
  });

  afterAll(async () => {
    await running.close();
  });

  it('binds loopback and reports a token-bearing URL', () => {
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\?token=/);
    expect(running.url).toContain(TOKEN);
    expect(running.port).toBeGreaterThan(0);
  });

  it('rejects a connection with the wrong token', async () => {
    const badUrl = running.url.replace(/token=.*/, 'token=wrong');
    const client = new Client({ name: 'bad', version: '1.0' });
    await expect(
      client.connect(new StreamableHTTPClientTransport(new URL(badUrl))),
    ).rejects.toThrow();
  });

  it('serves tools and validation over HTTP with the right token', async () => {
    const client = new Client({ name: 'good', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(running.url)));

    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain('validate_workflow');
    expect(tools).toContain('generate_workflow');

    const bad = await client.callTool({ name: 'validate_workflow', arguments: { workflow: { nope: true } } });
    expect(bad.isError).toBe(true);

    const resources = await client.listResources();
    expect(resources.resources.length).toBeGreaterThan(0);

    await client.close();
  });
});
