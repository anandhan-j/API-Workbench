import { useEffect, useState } from 'react';
import type { McpStatus, McpRunState } from '@shared/mcp';
import { invoke, isBridgeAvailable, onMcpStatusChanged } from '../lib/ipc';

const STATE_LABEL: Record<McpRunState, string> = {
  stopped: 'Stopped',
  starting: 'Starting…',
  running: 'Running',
  error: 'Error',
};

const STATE_DOT: Record<McpRunState, string> = {
  stopped: 'bg-muted',
  starting: 'bg-warning',
  running: 'bg-success',
  error: 'bg-danger',
};

function clampPort(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : 0;
}

/** Settings section that starts/stops the bundled workflow MCP server. */
export function McpServerSettings(): JSX.Element {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [port, setPort] = useState('0');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!isBridgeAvailable()) return undefined;
    void invoke('mcp.getStatus', {})
      .then((s) => {
        setStatus(s);
        setPort(String(s.configuredPort));
      })
      .catch(() => undefined);
    return onMcpStatusChanged((s) => setStatus(s));
  }, []);

  if (!isBridgeAvailable()) {
    return (
      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Workflow MCP server</h3>
        <p className="mt-3 text-sm text-muted">
          The MCP server is available when running inside the desktop app.
        </p>
      </section>
    );
  }

  const state: McpRunState = status?.state ?? 'stopped';
  const active = state === 'running' || state === 'starting';
  const tls = status?.configuredTls ?? false;
  const url = status?.url ?? '';

  const toggleTls = (next: boolean): void => {
    void invoke('mcp.setTls', { tls: next }).catch(() => undefined);
  };

  const copy = (label: string, text: string): void => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(label);
        setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => undefined);
  };

  const start = async (): Promise<void> => {
    setBusy(true);
    try {
      await invoke('mcp.setPort', { port: clampPort(port) });
      await invoke('mcp.start', {});
    } finally {
      setBusy(false);
    }
  };

  const stop = async (): Promise<void> => {
    setBusy(true);
    try {
      await invoke('mcp.stop', {});
    } finally {
      setBusy(false);
    }
  };

  const refreshToken = async (): Promise<void> => {
    const ok = window.confirm(
      'Generate a new token? The current connect URL will stop working and any MCP client (VS Code, Cursor) will need the new URL.',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await invoke('mcp.refreshToken', {});
    } finally {
      setBusy(false);
    }
  };

  const vscodeConfig = JSON.stringify(
    { servers: { 'api-workbench-workflows': { type: 'http', url } } },
    null,
    2,
  );

  return (
    <section className="mt-4 rounded-lg border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold">Workflow MCP server</h3>
      <p className="mt-1 text-sm text-muted">
        Run the built-in MCP server so AI assistants (VS Code, Cursor) can author and validate API
        Workbench workflows. It binds to localhost only and is protected by a token embedded in the
        URL. The token stays the same across restarts, so a client you configure once keeps working
        — use “Refresh token” to rotate it.
      </p>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className={`inline-block h-2 w-2 rounded-full ${STATE_DOT[state]}`} aria-hidden />
        <span className="font-medium">{STATE_LABEL[state]}</span>
        {status?.error && state === 'error' && (
          <span className="text-xs text-danger">— {status.error}</span>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Port (0 = auto)</span>
          <input
            type="number"
            min={0}
            max={65535}
            value={port}
            disabled={active || busy}
            onChange={(e) => setPort(e.target.value)}
            className="w-28 rounded-md border border-border bg-bg px-2 py-1.5 text-sm tabular-nums disabled:opacity-50"
          />
        </label>
        {active ? (
          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy}
            className="rounded-md border border-accent bg-accent px-4 py-2 text-sm text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Start
          </button>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={tls} onChange={(e) => toggleTls(e.target.checked)} />
        Use HTTPS (TLS)
      </label>
      {tls && (
        <p className="mt-2 text-xs text-muted">
          HTTPS uses a self-signed certificate generated on each start. Some MCP clients reject
          self-signed certificates — if a client fails to connect, turn HTTPS off (loopback HTTP is
          safe on your machine) or configure the client to trust the certificate.
        </p>
      )}

      {state === 'running' && url && (
        <div className="mt-4">
          <p className="text-xs text-muted">
            Connect URL — contains the auth token, so treat it like a secret:
          </p>
          <p className="mt-1 break-all rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs">
            {url}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => copy('url', url)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              {copied === 'url' ? 'Copied!' : 'Copy URL'}
            </button>
            <button
              type="button"
              onClick={() => copy('vscode', vscodeConfig)}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              {copied === 'vscode' ? 'Copied!' : 'Copy VS Code config'}
            </button>
            <button
              type="button"
              onClick={() => void refreshToken()}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-fg disabled:opacity-50"
            >
              Refresh token
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
