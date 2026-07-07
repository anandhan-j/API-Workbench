import { type ChildProcess, spawn } from 'node:child_process';

import type { McpChild, SpawnArgs } from './mcp-manager';
import { generateSelfSignedCert } from './tls';

/**
 * Production spawn seam for {@link McpServerManager}. Runs the bundled
 * `@api-workbench/workflow-mcp` entry as a child of Electron-as-Node
 * (`ELECTRON_RUN_AS_NODE`), in Streamable HTTP mode. Kept thin and out of the
 * manager so the manager stays Electron/child-process free and unit-testable.
 */

/** Resolves the package's runtime entry (dist/index.js) via node resolution. */
export function resolveMcpEntry(): string {
  return require.resolve('@api-workbench/workflow-mcp');
}

/** Env vars carrying a fresh self-signed cert/key (PEM) for the child's HTTPS mode. */
function tlsMaterialEnv(): Record<string, string> {
  const { cert, key } = generateSelfSignedCert();
  return { WORKFLOW_MCP_TLS_CERT: cert, WORKFLOW_MCP_TLS_KEY: key };
}

function forwardLines(
  stream: NodeJS.ReadableStream | null,
  onLine: (line: string) => void,
): void {
  if (!stream) return;
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) onLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  });
}

export function spawnMcpChild(args: SpawnArgs, log?: (message: string) => void): McpChild {
  const entry = resolveMcpEntry();
  // For HTTPS, generate an ephemeral self-signed cert and pass it via env so the
  // private key never touches disk; the child reads WORKFLOW_MCP_TLS_CERT/KEY.
  const tlsEnv = args.tls ? tlsMaterialEnv() : undefined;
  // When the back-channel is on, the child gets a writable stdin (so we can reply
  // to its `WORKFLOW_MCP_RPC` requests) and an env flag telling it the bridge is
  // available. Otherwise stdin stays ignored, exactly as before.
  const bridgeEnv = args.appBridge ? { WORKFLOW_MCP_APP_BRIDGE: '1' } : undefined;
  const child: ChildProcess = spawn(
    process.execPath,
    [entry, '--http', '--port', String(args.port), '--token', args.token],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...tlsEnv, ...bridgeEnv },
      // stdin is always piped (not just for the bridge): the child watches it for
      // EOF as a parent-liveness signal, so if the app crashes without a clean
      // shutdown the child exits instead of orphaning a loopback HTTP server.
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  let killed = false;
  forwardLines(child.stderr, (line) => log?.(`[mcp] ${line}`));

  return {
    onStdoutLine: (handler) => forwardLines(child.stdout, handler),
    onExit: (handler) => {
      child.on('exit', (code) => handler({ code, expected: killed }));
      child.on('error', (err) => {
        log?.(`[mcp] spawn error: ${err.message}`);
        handler({ code: null, expected: killed });
      });
    },
    send: (line) => {
      if (child.stdin?.writable) child.stdin.write(line);
    },
    kill: () => {
      killed = true;
      child.kill();
    },
  };
}
