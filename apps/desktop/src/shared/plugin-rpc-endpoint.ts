import { RpcMessage, RPC_TIMEOUTS, type RpcError } from './plugin-rpc';

/**
 * A symmetric, transport-agnostic RPC endpoint over {@link RpcMessage}
 * (Phase 16, ADR-0010). Both the main-process client and the plugin-host
 * runtime instantiate one — each side can issue calls and serve requests:
 *
 * - outbound `call()` correlates responses by id, applies per-method timeouts,
 *   and propagates an AbortSignal as a `cancel` message;
 * - inbound requests run through `onRequest` with an AbortSignal that fires
 *   when the peer cancels;
 * - `failPending()` rejects every in-flight call (peer process died).
 *
 * Inbound messages are schema-validated when `validateInbound` is set (main
 * side — the host is less trusted); invalid messages are dropped via `onDrop`.
 */

export interface RpcWire {
  send(message: RpcMessage): void;
  onMessage(handler: (message: unknown) => void): void;
}

export interface RpcEndpointOptions {
  onRequest: (method: string, params: unknown, signal: AbortSignal) => Promise<unknown>;
  onEvent?: (topic: string, payload: unknown) => void;
  /** Zod-validate inbound messages (main side). */
  validateInbound?: boolean;
  onDrop?: (reason: string) => void;
  defaultTimeoutMs?: number;
  now?: () => number;
}

export class RpcCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'RpcCallError';
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

let counter = 0;
function nextId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `rpc-${Date.now()}-${++counter}`;
}

export class RpcEndpoint {
  private readonly pending = new Map<string, Pending>();
  private readonly inbound = new Map<string, AbortController>();

  constructor(
    private readonly wire: RpcWire,
    private readonly options: RpcEndpointOptions,
  ) {
    wire.onMessage((raw) => this.receive(raw));
  }

  call(
    method: string,
    params: unknown,
    opts: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<unknown> {
    const id = nextId();
    const timeoutMs =
      opts.timeoutMs ?? RPC_TIMEOUTS[method] ?? this.options.defaultTimeoutMs ?? 30_000;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.wire.send({ kind: 'cancel', id });
        reject(new RpcCallError('E_RPC_TIMEOUT', `${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      const onAbort = (): void => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        clearTimeout(timer);
        this.wire.send({ kind: 'cancel', id });
        reject(new RpcCallError('E_RPC_CANCELLED', `${method} was cancelled`));
      };
      if (opts.signal?.aborted) {
        clearTimeout(timer);
        reject(new RpcCallError('E_RPC_CANCELLED', `${method} was cancelled`));
        return;
      }
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          opts.signal?.removeEventListener('abort', onAbort);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          opts.signal?.removeEventListener('abort', onAbort);
          reject(error);
        },
        timer,
      });
      this.wire.send({ kind: 'req', id, method, params });
    });
  }

  emit(topic: string, payload: unknown): void {
    this.wire.send({ kind: 'event', topic, payload });
  }

  /** Rejects every in-flight outbound call (peer process exited). */
  failPending(error: RpcError): void {
    for (const [, entry] of this.pending) {
      entry.reject(new RpcCallError(error.code, error.message, error.retryable ?? false));
    }
    this.pending.clear();
  }

  private receive(raw: unknown): void {
    let message: RpcMessage;
    if (this.options.validateInbound) {
      const parsed = RpcMessage.safeParse(raw);
      if (!parsed.success) {
        this.options.onDrop?.(`invalid rpc message: ${parsed.error.issues[0]?.message ?? '?'}`);
        return;
      }
      message = parsed.data;
    } else {
      message = raw as RpcMessage;
    }

    switch (message.kind) {
      case 'res': {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.ok) entry.resolve(message.result);
        else entry.reject(new RpcCallError(message.error.code, message.error.message, message.error.retryable ?? false));
        return;
      }
      case 'cancel': {
        this.inbound.get(message.id)?.abort();
        return;
      }
      case 'event': {
        this.options.onEvent?.(message.topic, message.payload);
        return;
      }
      case 'req': {
        const controller = new AbortController();
        this.inbound.set(message.id, controller);
        void this.options
          .onRequest(message.method, message.params, controller.signal)
          .then((result) => {
            if (this.inbound.delete(message.id)) {
              this.wire.send({ kind: 'res', id: message.id, ok: true, result });
            }
          })
          .catch((error: unknown) => {
            if (this.inbound.delete(message.id)) {
              const code = error instanceof RpcCallError ? error.code : 'E_PLUGIN_ERROR';
              this.wire.send({
                kind: 'res',
                id: message.id,
                ok: false,
                error: { code, message: error instanceof Error ? error.message : String(error) },
              });
            }
          });
        return;
      }
    }
  }
}
