/**
 * A back-channel from the MCP server to the API Workbench app that spawned it.
 *
 * When the desktop app runs this server as a managed child (HTTP mode), it can
 * service a small set of requests — currently "import this workflow into the
 * running app" — so a workflow authored in an AI client lands directly in the
 * app's workflow list. The app sets `WORKFLOW_MCP_APP_BRIDGE=1` and reads the
 * child's stdout; requests and responses are newline-delimited JSON:
 *
 *   child → app  (stdout):  `WORKFLOW_MCP_RPC {"id":1,"method":"importWorkflow","params":{…}}`
 *   app → child  (stdin):   `{"id":1,"ok":true,"result":{…}}`
 *
 * This reuses the pipe the app already reads (no extra network port). It is only
 * active in HTTP mode where stdout is not the JSON-RPC channel; in stdio mode the
 * bridge is disabled and `import_workflow_to_app` reports it is unavailable.
 */

/** Line prefix marking a child→app request on stdout. */
export const APP_RPC_PREFIX = 'WORKFLOW_MCP_RPC ';

export type AppRpcResult = { ok: true; result?: unknown } | { ok: false; error: string };

interface Pending {
  resolve: (result: AppRpcResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface AppBridge {
  /** True when the app has enabled the bridge (managed HTTP child). */
  readonly available: boolean;
  /** Send a request to the app and await its reply (or a timeout failure). */
  call(method: string, params: unknown, timeoutMs?: number): Promise<AppRpcResult>;
}

export interface AppBridgeOptions {
  enabled: boolean;
  /** Where requests are written (defaults to process.stdout). */
  stdout: { write(chunk: string): void };
  /** Where responses are read from (defaults to process.stdin). */
  stdin: NodeJS.ReadableStream;
  /** Default per-call timeout. */
  defaultTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Builds a bridge over the given streams. Split from the process-bound singleton
 * so the request/response correlation is unit-testable with fake streams.
 */
export function createAppBridge(options: AppBridgeOptions): AppBridge {
  const { enabled, stdout, stdin } = options;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pending = new Map<number, Pending>();
  let seq = 0;
  let listening = false;

  function settle(id: number, result: AppRpcResult): void {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(result);
  }

  function startListening(): void {
    if (listening) return;
    listening = true;
    let buffer = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => {
      buffer += chunk;
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) handleResponseLine(line);
        nl = buffer.indexOf('\n');
      }
    });
    // Don't let the stdin listener keep the process alive on its own.
    stdin.resume();
  }

  function handleResponseLine(line: string): void {
    let msg: { id?: unknown; ok?: unknown; result?: unknown; error?: unknown };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return; // not a JSON response line we care about
    }
    if (typeof msg.id !== 'number') return;
    if (msg.ok === true) settle(msg.id, { ok: true, result: msg.result });
    else settle(msg.id, { ok: false, error: typeof msg.error === 'string' ? msg.error : 'Unknown app error.' });
  }

  return {
    available: enabled,
    call(method, params, timeoutMs = defaultTimeoutMs): Promise<AppRpcResult> {
      if (!enabled) {
        return Promise.resolve({ ok: false, error: 'The app back-channel is not available.' });
      }
      startListening();
      const id = (seq += 1);
      return new Promise<AppRpcResult>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, error: 'The app did not respond in time.' });
        }, timeoutMs);
        pending.set(id, { resolve, timer });
        stdout.write(`${APP_RPC_PREFIX}${JSON.stringify({ id, method, params })}\n`);
      });
    },
  };
}

let singleton: AppBridge | undefined;

/** The process-bound bridge used by the tools (lazily created). */
export function appBridge(): AppBridge {
  if (!singleton) {
    singleton = createAppBridge({
      enabled: process.env.WORKFLOW_MCP_APP_BRIDGE === '1',
      stdout: process.stdout,
      stdin: process.stdin,
    });
  }
  return singleton;
}
