import type { McpStatus } from '@shared/mcp';

/**
 * Owns the lifecycle of the bundled `@api-workbench/workflow-mcp` server, run as
 * a child process in Streamable HTTP mode. Electron-free by design: the actual
 * spawn is injected as a port (see `spawn-child.ts` for the production impl), so
 * this is unit-testable against a fake child.
 */

export interface McpChild {
  /** Called for each line the child writes to stdout. */
  onStdoutLine(handler: (line: string) => void): void;
  /** Called once when the child exits. `expected` is true if we asked it to stop. */
  onExit(handler: (info: { code: number | null; expected: boolean }) => void): void;
  /** Writes a line to the child's stdin (the app→child reply channel). */
  send(line: string): void;
  kill(): void;
}

export interface SpawnArgs {
  port: number;
  token: string;
  /** Serve over HTTPS (self-signed) instead of plain HTTP. */
  tls: boolean;
  /** Enable the child→app back-channel (workflow import) over stdio. */
  appBridge: boolean;
}

/** A request the child sends back to the app over stdio (see spawn-child / app-bridge). */
export interface AppRpcRequest {
  id: number;
  method: string;
  params: unknown;
}

/** The outcome of servicing an {@link AppRpcRequest} (before the id is attached). */
export type AppRpcResult = { ok: true; result?: unknown } | { ok: false; error: string };

/** The app's reply to an {@link AppRpcRequest}, sent back over the child's stdin. */
export type AppRpcResponse = AppRpcResult & { id: number };

export type SpawnMcpChild = (args: SpawnArgs) => McpChild;

export interface McpManagerDeps {
  spawn: SpawnMcpChild;
  /** Persisted port *preference*: a fixed port, or 0 to auto-assign a free one. */
  initialPort: number;
  /**
   * Persisted last auto-assigned port (the "sticky" port). Used only when
   * `initialPort` is 0: the server reuses it so the URL stays stable, and falls
   * back to a fresh free port if it is unavailable. 0/absent = none yet.
   */
  initialAssignedPort?: number;
  /** Persisted HTTPS/TLS preference. */
  initialTls?: boolean;
  /**
   * Persisted bearer token. When non-empty it is reused so the connect URL stays
   * stable across restarts; when empty/absent a fresh one is generated on
   * construction and reported via `onTokenChanged` so the caller can persist it.
   */
  initialToken?: string;
  generateToken: () => string;
  /** Called whenever the token changes (initial generation or an explicit refresh). */
  onTokenChanged?: (token: string) => void;
  /**
   * Called when the sticky auto-assigned port changes: set to the bound port on
   * first auto-run, and reset to 0 when a remembered port was unavailable. Persist
   * it so the port stays stable across restarts (like the token).
   */
  onAssignedPortChanged?: (port: number) => void;
  /**
   * Services a child→app request (e.g. importing an authored workflow into the
   * app). When provided, the child is spawned with the back-channel enabled and
   * its `WORKFLOW_MCP_RPC` lines are dispatched here; the resolved response is
   * written back to the child. Absent → the back-channel stays off.
   */
  handleAppRpc?: (request: AppRpcRequest) => Promise<AppRpcResult>;
  onStatusChanged?: (status: McpStatus) => void;
  log?: (message: string) => void;
  /** How long to wait for the child to report its URL before failing. */
  readyTimeoutMs?: number;
}

const DEFAULT_READY_TIMEOUT_MS = 8_000;
const LISTENING_RE = /WORKFLOW_MCP_LISTENING (\S+)/;

/** Masks the bearer token in a connect URL so it is safe to write to the log. */
function redactToken(url: string): string {
  return url.replace(/([?&]token=)[^&]*/i, '$1***');
}
/** Prefix of a child→app request line on stdout (mirrors the package's app-bridge). */
const APP_RPC_PREFIX = 'WORKFLOW_MCP_RPC ';

export class McpServerManager {
  private readonly deps: McpManagerDeps;
  private configuredPort: number;
  private assignedPort: number;
  private configuredTls: boolean;
  private token: string;
  private child: McpChild | undefined;
  private state: McpStatus['state'] = 'stopped';
  private url: string | null = null;
  private boundPort = 0;
  private error: string | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  /** Resolver for the in-flight `start()`; set only while state is `starting`. */
  private startSettle: ((status: McpStatus) => void) | undefined;

  constructor(deps: McpManagerDeps) {
    this.deps = deps;
    this.configuredPort = deps.initialPort;
    this.assignedPort = deps.initialAssignedPort ?? 0;
    this.configuredTls = deps.initialTls ?? false;
    if (deps.initialToken && deps.initialToken.length > 0) {
      this.token = deps.initialToken;
    } else {
      // No token persisted yet — mint one and report it so the caller can persist
      // it. This makes the token static from first run onward.
      this.token = deps.generateToken();
      deps.onTokenChanged?.(this.token);
    }
  }

  status(): McpStatus {
    return {
      state: this.state,
      url: this.url,
      port: this.state === 'running' ? this.boundPort : this.configuredPort,
      configuredPort: this.configuredPort,
      configuredTls: this.configuredTls,
      secure: this.url?.startsWith('https:') ?? false,
      error: this.error,
    };
  }

  /** The port to actually bind: a fixed preference, else the sticky auto port (0 = let the OS pick). */
  private effectivePort(): number {
    return this.configuredPort !== 0 ? this.configuredPort : this.assignedPort;
  }

  async start(): Promise<McpStatus> {
    if (this.state === 'running' || this.state === 'starting') return this.status();

    const attemptedPort = this.effectivePort();
    const status = await this.attemptStart(attemptedPort);

    // A specific port didn't bind (e.g. still held by a previous run — EADDRINUSE).
    // Retry once on a fresh OS-assigned port so the server still comes up. When we
    // were reusing a remembered auto port, forget it so we don't keep retrying a
    // dead port on every launch. (A pure-auto attempt — port 0 — can't be a port
    // conflict, so it isn't retried.)
    if (status.state === 'error' && attemptedPort !== 0) {
      if (this.configuredPort === 0 && this.assignedPort !== 0) {
        this.assignedPort = 0;
        this.deps.onAssignedPortChanged?.(0);
      }
      this.log(`MCP port ${attemptedPort} was unavailable; selecting a free port instead.`);
      return this.attemptStart(0);
    }
    return status;
  }

  private async attemptStart(port: number): Promise<McpStatus> {
    this.setState('starting', null);

    let child: McpChild;
    try {
      child = this.deps.spawn({
        port,
        token: this.token,
        tls: this.configuredTls,
        appBridge: Boolean(this.deps.handleAppRpc),
      });
    } catch (err) {
      return this.fail(`Failed to start MCP server: ${(err as Error).message}`);
    }
    this.child = child;

    return new Promise<McpStatus>((resolve) => {
      this.startSettle = resolve;

      this.readyTimer = setTimeout(() => {
        // Take ownership of the resolver so the kill's `onExit` can't settle first
        // with a less specific message; then kill, mark timed-out, and resolve.
        const resolve = this.startSettle;
        this.startSettle = undefined;
        this.clearReadyTimer();
        this.killChild();
        const status = this.fail('MCP server timed out before reporting its URL.');
        resolve?.(status);
      }, this.deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);

      child.onStdoutLine((line) => {
        if (line.startsWith(APP_RPC_PREFIX)) {
          void this.dispatchAppRpc(child, line.slice(APP_RPC_PREFIX.length));
          return;
        }
        if (this.state !== 'starting') return;
        const match = LISTENING_RE.exec(line);
        if (!match) return;
        this.url = match[1] ?? null;
        this.boundPort = this.url ? Number.parseInt(new URL(this.url).port, 10) || 0 : 0;
        // Auto-assign mode (port 0): remember the OS-chosen port so subsequent
        // runs reuse it — the same "assign once, then stay stable" contract as the
        // token. Persisted only when it actually changes.
        if (this.configuredPort === 0 && this.boundPort > 0 && this.boundPort !== this.assignedPort) {
          this.assignedPort = this.boundPort;
          this.deps.onAssignedPortChanged?.(this.boundPort);
        }
        this.setState('running', null);
        // Redact the token from the URL before logging — the log may be persisted
        // to disk; the un-redacted URL is only exposed to the user via status().
        this.log(`MCP server running at ${redactToken(this.url)}`);
        this.settleStart(this.status());
      });

      child.onExit(({ code, expected }) => {
        this.child = undefined;
        this.url = null;
        this.boundPort = 0;
        if (this.startSettle) {
          // Exited before it ever reported a URL — a startup failure.
          this.settleStart(
            this.fail(
              expected
                ? 'MCP server stopped during startup.'
                : `MCP server exited during startup (code ${code ?? 'unknown'}).`,
            ),
          );
        } else if (this.state === 'running') {
          if (expected) this.setState('stopped', null);
          else this.setState('error', `MCP server exited unexpectedly (code ${code ?? 'unknown'}).`);
        }
      });
    });
  }

  async stop(): Promise<McpStatus> {
    this.clearReadyTimer();
    this.startSettle = undefined;
    this.killChild();
    this.url = null;
    this.boundPort = 0;
    this.setState('stopped', null);
    return this.status();
  }

  /** Update the port preference. If running, restart to apply it. */
  async setPort(port: number): Promise<McpStatus> {
    this.configuredPort = port;
    return this.applyConfigChange();
  }

  /** Update the HTTPS/TLS preference. If running, restart to apply it. */
  async setTls(tls: boolean): Promise<McpStatus> {
    this.configuredTls = tls;
    return this.applyConfigChange();
  }

  /**
   * Rotate the bearer token. This is the *only* path that changes the token —
   * normal starts reuse the persisted one — so the connect URL stays stable until
   * the user explicitly opts to refresh. The new token is reported via
   * `onTokenChanged` for persistence, and if the server is running it restarts so
   * the change takes effect immediately (invalidating any client using the old URL).
   */
  async refreshToken(): Promise<McpStatus> {
    this.token = this.deps.generateToken();
    this.deps.onTokenChanged?.(this.token);
    return this.applyConfigChange();
  }

  /** Restart to apply a config change when active, otherwise just persist + notify. */
  private async applyConfigChange(): Promise<McpStatus> {
    if (this.state === 'running' || this.state === 'starting') {
      await this.stop();
      return this.start();
    }
    this.notify();
    return this.status();
  }

  dispose(): void {
    this.clearReadyTimer();
    this.startSettle = undefined;
    this.killChild();
  }

  /**
   * Handles one child→app request line: parses it, runs the injected handler, and
   * writes the reply back to the child. Never throws into the stdout callback —
   * a malformed line or handler error becomes an error response (or is dropped if
   * we can't even recover the request id).
   */
  private async dispatchAppRpc(child: McpChild, payload: string): Promise<void> {
    let request: AppRpcRequest;
    try {
      const parsed = JSON.parse(payload) as Partial<AppRpcRequest>;
      if (typeof parsed.id !== 'number' || typeof parsed.method !== 'string') return;
      request = { id: parsed.id, method: parsed.method, params: parsed.params };
    } catch {
      return; // unparseable — no id to reply to
    }

    const handler = this.deps.handleAppRpc;
    let response: AppRpcResponse;
    if (!handler) {
      response = { id: request.id, ok: false, error: 'The app back-channel is not enabled.' };
    } else {
      try {
        const result = await handler(request);
        response = result.ok
          ? { id: request.id, ok: true, result: result.result }
          : { id: request.id, ok: false, error: result.error };
      } catch (err) {
        response = { id: request.id, ok: false, error: (err as Error).message };
      }
    }
    try {
      child.send(`${JSON.stringify(response)}\n`);
    } catch (err) {
      this.log(`Failed to reply to MCP app request: ${(err as Error).message}`);
    }
  }

  private killChild(): void {
    if (this.child) {
      const child = this.child;
      this.child = undefined;
      child.kill();
    }
  }

  private settleStart(status: McpStatus): void {
    const resolve = this.startSettle;
    this.startSettle = undefined;
    this.clearReadyTimer();
    resolve?.(status);
  }

  private fail(message: string): McpStatus {
    this.child = undefined;
    this.url = null;
    this.boundPort = 0;
    this.setState('error', message);
    return this.status();
  }

  private setState(state: McpStatus['state'], error: string | null): void {
    const changed = state !== this.state || error !== this.error;
    this.state = state;
    this.error = error;
    if (changed) this.notify();
  }

  private notify(): void {
    this.deps.onStatusChanged?.(this.status());
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }
  }

  private log(message: string): void {
    this.deps.log?.(message);
  }
}
