import type { z } from 'zod';
import type { ApplyContext, AuthArtifacts } from '@shared/auth';
import type { ExecutionOptions } from '@shared/execution';
import type { ProtocolResponse } from '@shared/protocol';

/**
 * Runtime registry for request-type providers (Phase 16, ADR-0009).
 *
 * A provider owns one request type end-to-end: it validates the envelope's
 * `payload`, decides how variables are substituted, tells auth what it may
 * sign ({@link ApplyContext}), summarises the payload for list/tree display
 * (the `badge`/`target` stored in the requests table columns), and executes.
 * HTTP is built-in provider #1; plugin providers execute over RPC in the host.
 */

export interface ProviderExecuteContext {
  artifacts: AuthArtifacts;
  options?: Partial<ExecutionOptions>;
  signal?: AbortSignal;
  /** Resolves `{{variables}}` against the envelope's variable context. */
  evaluate: (template: string) => string;
}

export interface MainRequestTypeProvider {
  type: string;
  payloadSchema: z.ZodType;
  /**
   * Substitutes variables in the payload before auth/execute. The HTTP
   * provider returns the payload untouched (it evaluates field-by-field during
   * build, preserving exact legacy semantics); plugin providers get a generic
   * deep string substitution.
   */
  resolveVariables(payload: unknown, evaluate: (template: string) => string): unknown;
  /** What auth signing sees. Non-HTTP types may omit `method`/`body`. */
  buildApplyContext(payload: unknown, evaluate: (template: string) => string): ApplyContext;
  /** Display summary persisted to the requests table (`method`/`url` columns). */
  summarize(payload: unknown): { badge: string; target: string };
  execute(payload: unknown, ctx: ProviderExecuteContext): Promise<ProtocolResponse>;
}

/** Thrown when an envelope names a type with no registered provider. */
export class UnknownRequestTypeError extends Error {
  readonly code = 'E_UNKNOWN_REQUEST_TYPE';
  constructor(type: string) {
    super(
      type.startsWith('plugin:')
        ? `Unknown request type "${type}" — the contributing plugin may be disabled or uninstalled`
        : `Unknown request type "${type}"`,
    );
    this.name = 'UnknownRequestTypeError';
  }
}

/** Fully-qualified plugin request type: `plugin:<pluginId>/<type>`. */
export function pluginRequestType(pluginId: string, type: string): string {
  return `plugin:${pluginId}/${type}`;
}

export class RequestTypeRegistry {
  private readonly entries = new Map<string, MainRequestTypeProvider>();
  private readonly pluginOwner = new Map<string, string>();

  constructor(builtins: MainRequestTypeProvider[]) {
    for (const provider of builtins) this.entries.set(provider.type, provider);
  }

  resolve(type: string): MainRequestTypeProvider {
    const provider = this.entries.get(type);
    if (!provider) throw new UnknownRequestTypeError(type);
    return provider;
  }

  has(type: string): boolean {
    return this.entries.has(type);
  }

  registerPlugin(pluginId: string, provider: Omit<MainRequestTypeProvider, 'type'> & { type: string }): void {
    const qualified = pluginRequestType(pluginId, provider.type);
    if (this.entries.has(qualified)) {
      throw new Error(`Request type "${qualified}" is already registered`);
    }
    this.entries.set(qualified, { ...provider, type: qualified });
    this.pluginOwner.set(qualified, pluginId);
  }

  /** Removes every provider a plugin registered (uninstall/disable). */
  unregisterPlugin(pluginId: string): void {
    for (const [type, owner] of this.pluginOwner) {
      if (owner === pluginId) {
        this.entries.delete(type);
        this.pluginOwner.delete(type);
      }
    }
  }

  types(): string[] {
    return [...this.entries.keys()];
  }
}
