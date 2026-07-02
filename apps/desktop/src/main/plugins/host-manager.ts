import type { ApplyContext } from '@shared/auth';
import {
  ActivatePluginResult,
  AuthApplyResult,
  HostReadyPayload,
  ImporterDetectResult,
  ImporterParseResult as RpcImporterParseResult,
  NodeExecuteResult,
  RequestExecuteResult,
} from '@shared/plugin-rpc';
import { RpcEndpoint } from '@shared/plugin-rpc-endpoint';
import { NormalizedSpec } from '@shared/openapi';
import { compileFormSchemaToZod, type FormSchema } from '@shared/forms';
import type { Capability, PluginManifest, RequestTypeContribution } from '@shared/plugins';
import type { ProtocolResponse } from '@shared/protocol';
import type { PluginHostPort } from './plugin-service';
import type { HostTransport, SpawnHostTransport } from './host-transport';
import type { CapabilityBroker } from './capability-broker';
import type { NodeExecutorRegistry } from './registries/node-executor-registry';
import type { AuthProviderRegistry } from './registries/auth-provider-registry';
import type { ImporterRegistry } from './registries/importer-registry';
import type { RequestTypeRegistry } from './registries/request-type-registry';

/**
 * Owns the plugin host process (Phase 16, ADR-0010): spawn + ready handshake,
 * per-plugin activate/deactivate, registration of RPC-backed entries into the
 * four extension registries, and the crash policy — reject in-flight calls,
 * respawn with exponential backoff (max {@link MAX_RESTARTS} per
 * {@link RESTART_WINDOW_MS}), then re-activate every previously active plugin.
 */

const READY_TIMEOUT_MS = 5_000;
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 5 * 60_000;

export interface HostManagerDeps {
  spawn: SpawnHostTransport;
  broker: CapabilityBroker;
  registries: {
    nodes: NodeExecutorRegistry;
    auth: AuthProviderRegistry;
    importers: ImporterRegistry;
    requestTypes: RequestTypeRegistry;
  };
  log?: (level: 'info' | 'warn' | 'error', message: string, context?: object) => void;
  /** Notifies the renderer that plugin state changed (statuses, restarts). */
  onChanged?: (reason: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

interface ActiveRecord {
  pluginId: string;
  entryPath: string;
  grantedCapabilities: Capability[];
  manifest: PluginManifest;
}

type Status = { status: 'active' | 'error' | 'host-failed'; message?: string };

export class PluginHostManager implements PluginHostPort {
  private endpoint: RpcEndpoint | undefined;
  private transport: HostTransport | undefined;
  private readonly active = new Map<string, ActiveRecord>();
  private readonly statuses = new Map<string, Status>();
  private restarts: number[] = [];
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: HostManagerDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async activate(input: ActiveRecord): Promise<void> {
    try {
      // Inside the try: a host that fails to spawn or become ready must mark
      // this plugin 'error', not leave it reported as the default 'active'.
      const endpoint = await this.ensureHost();
      const raw = await endpoint.call('plugin.activate', input);
      const registered = ActivatePluginResult.parse(raw);
      this.crossCheckRegistrations(input.manifest, registered);
      this.registerContributions(input);
      this.active.set(input.pluginId, input);
      this.statuses.set(input.pluginId, { status: 'active' });
      this.deps.onChanged?.('activated');
    } catch (error) {
      this.statuses.set(input.pluginId, {
        status: 'error',
        message: (error as Error).message,
      });
      this.deps.onChanged?.('activation-failed');
      throw error;
    }
  }

  async deactivate(pluginId: string): Promise<void> {
    this.unregisterContributions(pluginId);
    this.active.delete(pluginId);
    this.statuses.delete(pluginId);
    if (this.endpoint) {
      await this.endpoint.call('plugin.deactivate', { pluginId }).catch((error: unknown) => {
        this.deps.log?.('warn', 'Plugin deactivate RPC failed', {
          pluginId,
          message: (error as Error).message,
        });
      });
    }
    this.deps.onChanged?.('deactivated');
  }

  statusOf(pluginId: string): Status {
    return this.statuses.get(pluginId) ?? { status: 'active' };
  }

  /** Stops the host (app shutdown). */
  dispose(): void {
    this.transport?.kill();
    this.transport = undefined;
    this.endpoint = undefined;
  }

  // --- host lifecycle ---

  private async ensureHost(): Promise<RpcEndpoint> {
    if (this.endpoint) return this.endpoint;
    return this.spawnHost();
  }

  private async spawnHost(): Promise<RpcEndpoint> {
    const transport = this.deps.spawn();
    this.transport = transport;

    let readyResolve: (v: string) => void;
    let readyReject: (e: Error) => void;
    const ready = new Promise<string>((res, rej) => {
      readyResolve = res;
      readyReject = rej;
    });
    const readyTimer = setTimeout(
      () => readyReject(new Error('Plugin host did not become ready in time')),
      READY_TIMEOUT_MS,
    );

    const endpoint = new RpcEndpoint(transport, {
      validateInbound: true,
      onDrop: (reason) => this.deps.log?.('warn', 'Dropped plugin host message', { reason }),
      onRequest: (method, params) => this.deps.broker.handle(method, params),
      onEvent: (topic, payload) => {
        if (topic === 'host.ready') {
          const parsed = HostReadyPayload.safeParse(payload);
          if (parsed.success) {
            clearTimeout(readyTimer);
            readyResolve(parsed.data.sdkVersion);
          }
          return;
        }
        if (topic === 'plugin.log') this.deps.broker.handleLogEvent(payload);
      },
    });

    transport.onExit(({ code, expected }) => {
      if (this.transport !== transport) return;
      this.endpoint = undefined;
      this.transport = undefined;
      endpoint.failPending({ code: 'E_HOST_CRASHED', message: `Plugin host exited (${code})` });
      if (expected) return;
      this.deps.log?.('error', 'Plugin host crashed', { code });
      for (const id of this.active.keys()) {
        this.statuses.set(id, { status: 'host-failed', message: `Host exited with code ${code}` });
        this.unregisterContributions(id);
      }
      this.deps.onChanged?.('host-crashed');
      void this.respawn();
    });

    this.endpoint = endpoint;
    try {
      await ready;
    } catch (error) {
      // A host that never became ready must not be kept as the live endpoint,
      // or every later call would hang against a dead process.
      if (this.transport === transport) {
        this.transport = undefined;
        this.endpoint = undefined;
      }
      transport.kill();
      throw error;
    }
    return endpoint;
  }

  private async respawn(): Promise<void> {
    const now = Date.now();
    this.restarts = this.restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (this.restarts.length >= MAX_RESTARTS) {
      this.deps.log?.('error', 'Plugin host restart limit reached; giving up', {
        restarts: this.restarts.length,
      });
      this.deps.onChanged?.('host-failed');
      return;
    }
    this.restarts.push(now);
    await this.sleep(1000 * 2 ** (this.restarts.length - 1));

    const toReactivate = [...this.active.values()];
    this.active.clear();
    try {
      await this.spawnHost();
    } catch (error) {
      this.deps.log?.('error', 'Plugin host respawn failed', {
        message: (error as Error).message,
      });
      this.deps.onChanged?.('host-failed');
      return;
    }
    for (const record of toReactivate) {
      await this.activate(record).catch((error: unknown) => {
        this.deps.log?.('error', 'Plugin re-activation failed after host restart', {
          pluginId: record.pluginId,
          message: (error as Error).message,
        });
      });
    }
    this.deps.onChanged?.('host-restarted');
  }

  // --- registration bridging ---

  private crossCheckRegistrations(
    manifest: PluginManifest,
    registered: ActivatePluginResult,
  ): void {
    const missing: string[] = [];
    for (const c of manifest.contributes.nodes) {
      if (!registered.nodes.includes(c.kind)) missing.push(`node "${c.kind}"`);
    }
    for (const c of manifest.contributes.requestTypes) {
      if (!registered.requestTypes.includes(c.type)) missing.push(`request type "${c.type}"`);
    }
    for (const c of manifest.contributes.authProviders) {
      if (!registered.authProviders.includes(c.type)) missing.push(`auth provider "${c.type}"`);
    }
    for (const c of manifest.contributes.importers) {
      if (!registered.importers.includes(c.id)) missing.push(`importer "${c.id}"`);
    }
    if (missing.length > 0) {
      throw new Error(`activate() did not register declared contributions: ${missing.join(', ')}`);
    }
  }

  private registerContributions(record: ActiveRecord): void {
    const { pluginId, manifest } = record;
    const call = (method: string, params: unknown, opts?: { timeoutMs?: number; signal?: AbortSignal }) => {
      if (!this.endpoint) return Promise.reject(new Error('Plugin host is not running'));
      return this.endpoint.call(method, params, opts);
    };

    for (const c of manifest.contributes.nodes) {
      const configSchema = compileFormSchemaToZod(c.configSchema);
      this.deps.registries.nodes.registerPlugin(pluginId, c.kind, async (node, env) => {
        const config = configSchema.parse(node.config ?? {});

        // Declared input: prompt the user (same native modal as the built-in
        // user-input node) before the executor runs, then thread the collected
        // values through. Rendering stays in trusted host code — the plugin
        // never sees the prompt, only the resulting values in `runtime`.
        let collected: Record<string, string> = {};
        if (c.input) {
          const fields = c.input.fields.map((f) => ({
            label: f.label,
            variable: f.variable,
            default: env.ports.evaluate(f.default, env.ctx),
            secret: f.secret,
          }));
          if (env.ports.requestInput) {
            const { values, cancelled } = await env.ports.requestInput(
              {
                workflowId: env.ctx.workflowId,
                nodeId: node.id,
                name: node.name,
                message: c.input.message,
                fields,
              },
              env.ctx,
            );
            if (cancelled) {
              return {
                result: { ...env.base, status: 'failed', durationMs: env.done(), message: 'Input cancelled' },
                handle: null,
              };
            }
            collected = values;
          } else {
            // Headless fallback: accept the evaluated defaults.
            collected = Object.fromEntries(fields.map((f) => [f.variable, f.default]));
          }
        }

        const runtime = c.input ? { ...env.ctx.runtime, ...collected } : env.ctx.runtime;
        const raw = await call(
          'node.execute',
          { pluginId, kind: c.kind, config, runtime },
          { signal: env.control.signal },
        );
        const result = NodeExecuteResult.parse(raw);
        // Collected input values are node variables too; the executor's own
        // returned variables win on key collisions.
        const variablesSet = { ...collected, ...(result.variables ?? {}) };
        return {
          result: {
            ...env.base,
            status: 'success',
            durationMs: env.done(),
            ...(Object.keys(variablesSet).length ? { variablesSet } : {}),
            ...(result.message ? { message: result.message } : {}),
          },
          handle: c.branching ? (result.branch ?? null) : null,
        };
      });
    }

    for (const c of manifest.contributes.authProviders) {
      const configSchema = compileFormSchemaToZod(c.configSchema);
      this.deps.registries.auth.registerPlugin(pluginId, c.type, async (config, ctx) => {
        const parsed = configSchema.parse(config);
        const raw = await call('auth.apply', {
          pluginId,
          type: c.type,
          config: parsed,
          ctx: pickApplyContext(ctx),
        });
        return AuthApplyResult.parse(raw);
      });
    }

    for (const c of manifest.contributes.importers) {
      this.deps.registries.importers.registerPlugin(pluginId, c.id, {
        detect: async (content) => {
          const raw = await call('importer.detect', { pluginId, id: c.id, content }).catch(
            () => ({ matches: false }),
          );
          return ImporterDetectResult.parse(raw).matches;
        },
        parse: async (content) => {
          const raw = await call('importer.parse', { pluginId, id: c.id, content });
          const { spec } = RpcImporterParseResult.parse(raw);
          return { spec: NormalizedSpec.parse(spec), format: 'plugin' };
        },
      });
    }

    for (const c of manifest.contributes.requestTypes) {
      this.deps.registries.requestTypes.registerPlugin(
        pluginId,
        buildRequestTypeProvider(c, pluginId, call),
      );
    }
  }

  private unregisterContributions(pluginId: string): void {
    this.deps.registries.nodes.unregisterPlugin(pluginId);
    this.deps.registries.auth.unregisterPlugin(pluginId);
    this.deps.registries.importers.unregisterPlugin(pluginId);
    this.deps.registries.requestTypes.unregisterPlugin(pluginId);
  }
}

function pickApplyContext(ctx: ApplyContext): {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
} {
  return {
    ...(ctx.method !== undefined ? { method: ctx.method } : {}),
    url: ctx.url,
    ...(ctx.headers !== undefined ? { headers: ctx.headers } : {}),
    ...(ctx.body !== undefined ? { body: ctx.body } : {}),
  };
}

/** Substitutes `{{vars}}` in top-level string values, honoring per-field opt-outs. */
function substitutePayload(
  payload: Record<string, unknown>,
  schema: FormSchema,
  evaluate: (template: string) => string,
): Record<string, unknown> {
  const skip = new Set(schema.fields.filter((f) => !f.substituteVariables).map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (skip.has(key)) {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = evaluate(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          typeof v === 'string' ? evaluate(v) : v,
        ]),
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}

function buildRequestTypeProvider(
  contribution: RequestTypeContribution,
  pluginId: string,
  call: (
    method: string,
    params: unknown,
    opts?: { timeoutMs?: number; signal?: AbortSignal },
  ) => Promise<unknown>,
): Parameters<RequestTypeRegistry['registerPlugin']>[1] {
  const payloadSchema = compileFormSchemaToZod(contribution.payloadSchema);
  const targetOf = (payload: unknown): string =>
    String((payload as Record<string, unknown>)[contribution.summary.targetKey] ?? '');

  return {
    type: contribution.type,
    payloadSchema,
    resolveVariables: (payload, evaluate) =>
      substitutePayload(payload as Record<string, unknown>, contribution.payloadSchema, evaluate),
    buildApplyContext: (payload) => ({ url: targetOf(payload) }),
    summarize: (payload) => ({ badge: contribution.summary.badge, target: targetOf(payload) }),
    async execute(payload, ctx): Promise<ProtocolResponse> {
      const startedAt = Date.now();
      const raw = await call(
        'request.execute',
        {
          pluginId,
          type: contribution.type,
          payload,
          ...(ctx.artifacts ? { artifacts: ctx.artifacts } : {}),
          options: { timeoutMs: ctx.options?.timeoutMs ?? 30_000 },
        },
        {
          ...(ctx.signal ? { signal: ctx.signal } : {}),
          ...(ctx.options?.timeoutMs ? { timeoutMs: ctx.options.timeoutMs } : {}),
        },
      );
      const result = RequestExecuteResult.parse(raw);
      return {
        type: `plugin:${pluginId}/${contribution.type}`,
        ok: result.ok,
        summary: result.summary,
        metadata: result.metadata,
        body: result.body,
        bodyKind: result.bodyKind,
        contentType: result.contentType,
        sizeBytes: Buffer.byteLength(result.body, 'utf8'),
        timings: { startedAt, totalMs: Date.now() - startedAt },
        ...(result.error !== undefined ? { error: result.error } : {}),
        ...(result.protocol !== undefined ? { protocol: result.protocol } : {}),
      };
    },
  };
}
