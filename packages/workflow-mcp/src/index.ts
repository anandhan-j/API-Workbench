#!/usr/bin/env node
/**
 * @api-workbench/workflow-mcp — MCP server entrypoint.
 *
 * Lets AI clients (Claude Desktop, VS Code Copilot, Cursor, Codex) author
 * API Workbench workflow JSON that is guaranteed to match the app's own
 * workflow schema.
 *
 * Two transports:
 *   - stdio (default): the client spawns this process and talks over
 *     stdin/stdout. IMPORTANT: in this mode stdout is the JSON-RPC channel, so
 *     all diagnostics go to stderr.
 *   - Streamable HTTP (`--http`): binds a loopback, token-gated listener so a
 *     host app can spawn the server and hand its URL to clients.
 *
 * Flags: `--http`, `--port <n>` (0 = auto), `--token <t>` (else auto/env
 * WORKFLOW_MCP_TOKEN). On HTTP start it prints one machine-readable line to
 * stdout: `WORKFLOW_MCP_LISTENING <url>` for the parent process to capture.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { redactTokenInUrl, startHttpServer, type TlsMaterial } from './http.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

export { createServer } from './server.js';

interface CliOptions {
  http: boolean;
  port: number;
  token: string | undefined;
  tlsCertPath: string | undefined;
  tlsKeyPath: string | undefined;
}

function parseArgs(argv: string[]): CliOptions {
  let http = false;
  let port = 0;
  let token: string | undefined = process.env.WORKFLOW_MCP_TOKEN;
  let tlsCertPath: string | undefined;
  let tlsKeyPath: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--http') http = true;
    else if (arg === '--port') port = Number.parseInt(argv[(i += 1)] ?? '', 10) || 0;
    else if (arg === '--token') token = argv[(i += 1)] ?? undefined;
    else if (arg === '--tls-cert') tlsCertPath = argv[(i += 1)] ?? undefined;
    else if (arg === '--tls-key') tlsKeyPath = argv[(i += 1)] ?? undefined;
  }
  return { http, port, token, tlsCertPath, tlsKeyPath };
}

/**
 * Resolves TLS material for HTTPS mode. The cert/key come from env (PEM contents,
 * so the private key never touches disk) or `--tls-cert`/`--tls-key` file paths.
 * Returns undefined when no TLS is configured (plain HTTP).
 */
function resolveTls(options: CliOptions): TlsMaterial | undefined {
  const envCert = process.env.WORKFLOW_MCP_TLS_CERT;
  const envKey = process.env.WORKFLOW_MCP_TLS_KEY;
  if (envCert && envKey) return { cert: envCert, key: envKey };
  if (options.tlsCertPath && options.tlsKeyPath) {
    return {
      cert: readFileSync(options.tlsCertPath, 'utf8'),
      key: readFileSync(options.tlsKeyPath, 'utf8'),
    };
  }
  return undefined;
}

async function runStdio(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

async function runHttp(options: CliOptions): Promise<void> {
  const token = options.token ?? randomUUID();
  const tls = resolveTls(options);
  const running = await startHttpServer({ port: options.port, token, createServer, tls });
  // Machine-readable line for the parent process (it already holds the token and
  // needs the full URL to surface it to the user); the human line to stderr may be
  // captured into the app's log file, so redact the token there.
  process.stdout.write(`WORKFLOW_MCP_LISTENING ${running.url}\n`);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} listening on ${redactTokenInUrl(running.url)}`);

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return; // 'end' and 'close' can both fire — close once.
    shuttingDown = true;
    void running.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  watchParentExit(shutdown);
}

/**
 * In HTTP mode the host app spawns us and pipes our stdin. If the app dies
 * ungracefully (crash, force-kill) it cannot send a signal, and this loopback,
 * token-holding HTTP server would be left orphaned. The piped stdin closing is a
 * reliable, cross-platform signal that the parent is gone — shut down when it does.
 * (In stdio mode stdin is the JSON-RPC channel and this is never called.)
 */
function watchParentExit(shutdown: () => void): void {
  const stdin = process.stdin;
  stdin.on('end', shutdown);
  stdin.on('close', shutdown);
  stdin.on('error', shutdown);
  // Put the stream in flowing mode so 'end'/'close' actually fire. Harmless if the
  // app-bridge is also consuming stdin (it attaches its own 'data' listener).
  stdin.resume();
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.http) await runHttp(options);
  else await runStdio();
}

main().catch((err: unknown) => {
  console.error('Fatal error starting workflow-mcp:', err);
  process.exit(1);
});
