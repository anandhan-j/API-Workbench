import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { afterEach, describe, expect, it } from 'vitest';

import { McpServerManager, type McpChild, type SpawnArgs } from '../mcp-manager';

/**
 * Exercises the manager against the REAL bundled `@api-workbench/workflow-mcp`
 * child in HTTP mode — the production path (minus Electron-as-Node, which is a
 * no-op detail here). Proves the child starts, binds a port, reports its URL,
 * and enforces the token, then that we can stop it cleanly.
 */
const require = createRequire(import.meta.url);
const entry = require.resolve('@api-workbench/workflow-mcp');
const selfsigned = require('selfsigned') as {
  generate: (attrs?: unknown[], opts?: Record<string, unknown>) => { private: string; cert: string };
};

function realSpawn(args: SpawnArgs): McpChild {
  let tlsEnv: Record<string, string> | undefined;
  if (args.tls) {
    const pems = selfsigned.generate([{ name: 'commonName', value: '127.0.0.1' }], {
      keySize: 2048,
      algorithm: 'sha256',
    });
    tlsEnv = { WORKFLOW_MCP_TLS_CERT: pems.cert, WORKFLOW_MCP_TLS_KEY: pems.private };
  }
  const child = spawn(
    process.execPath,
    [entry, '--http', '--port', String(args.port), '--token', args.token],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...tlsEnv } },
  );
  let killed = false;
  return {
    onStdoutLine: (handler) => {
      let buffer = '';
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        buffer += chunk;
        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, '');
          buffer = buffer.slice(nl + 1);
          if (line) handler(line);
          nl = buffer.indexOf('\n');
        }
      });
    },
    onExit: (handler) => child.on('exit', (code) => handler({ code, expected: killed })),
    // This integration harness doesn't exercise the app back-channel (stdin is
    // ignored above), so the reply channel is a no-op here.
    send: () => undefined,
    kill: () => {
      killed = true;
      child.kill();
    },
  };
}

describe('McpServerManager (real child, integration)', () => {
  let manager: McpServerManager | undefined;

  afterEach(async () => {
    await manager?.stop();
    manager = undefined;
  });

  it('starts the real workflow-mcp child and serves a token-gated HTTP endpoint', async () => {
    manager = new McpServerManager({
      spawn: realSpawn,
      initialPort: 0,
      generateToken: () => 'integration-token',
      readyTimeoutMs: 15_000,
    });

    const status = await manager.start();
    expect(status.state).toBe('running');
    expect(status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\?token=integration-token$/);
    expect(status.port).toBeGreaterThan(0);

    // The endpoint is live and rejects a request that omits the token.
    const noTokenUrl = status.url!.replace(/\?token=.*/, '');
    const res = await fetch(noTokenUrl, { method: 'GET' });
    expect(res.status).toBe(401);

    const stopped = await manager.stop();
    expect(stopped.state).toBe('stopped');
  }, 20_000);

  it('serves over HTTPS when TLS is enabled', async () => {
    const priorReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      manager = new McpServerManager({
        spawn: realSpawn,
        initialPort: 0,
        initialTls: true,
        generateToken: () => 'tls-int-token',
        readyTimeoutMs: 15_000,
      });
      const status = await manager.start();
      expect(status.state).toBe('running');
      expect(status.secure).toBe(true);
      expect(status.url).toMatch(/^https:\/\/127\.0\.0\.1:\d+\/mcp\?token=tls-int-token$/);

      const res = await fetch(status.url!.replace(/\?token=.*/, ''), { method: 'GET' });
      expect(res.status).toBe(401);
    } finally {
      if (priorReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = priorReject;
    }
  }, 20_000);
});
