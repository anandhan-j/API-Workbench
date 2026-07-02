import type {
  AuthProvider,
  Importer,
  NodeExecutor,
  PluginContext,
  RequestTypeProvider,
  WorkbenchPlugin,
} from '@api-workbench/plugin-sdk';
import {
  ActivatePluginParams,
  AuthApplyParams,
  DeactivatePluginParams,
  ImporterDetectParams,
  ImporterParseParams,
  NodeExecuteParams,
  RequestExecuteParams,
} from '@shared/plugin-rpc';
import { RpcCallError, RpcEndpoint, type RpcWire } from '@shared/plugin-rpc-endpoint';
import { buildPluginContext } from './sdk-runtime';

/**
 * The plugin host runtime (Phase 16, ADR-0010) — the unprivileged side of the
 * RPC bridge. It loads plugin entry modules, calls `activate()` with a
 * capability-gated {@link PluginContext}, and serves the main process's
 * dispatch calls (node/request/auth/importer execution). It is deliberately
 * Electron-free and takes its wire + module loader by injection, so the whole
 * runtime is unit-testable in-process.
 */

export interface HostRuntimeOptions {
  wire: RpcWire;
  /** Loads a plugin entry module and returns its exports (require in prod). */
  loadModule: (entryPath: string) => unknown;
  sdkVersion: string;
  /** Backing for the `network` capability; global fetch in prod. */
  fetchImpl?: typeof fetch;
}

export interface ActivePlugin {
  pluginId: string;
  plugin: WorkbenchPlugin;
  nodes: Map<string, NodeExecutor>;
  requestTypes: Map<string, RequestTypeProvider>;
  authProviders: Map<string, AuthProvider>;
  importers: Map<string, Importer>;
}

function pluginError(code: string, message: string): RpcCallError {
  return new RpcCallError(code, message);
}

export class PluginHostRuntime {
  private readonly endpoint: RpcEndpoint;
  private readonly plugins = new Map<string, ActivePlugin>();

  constructor(private readonly options: HostRuntimeOptions) {
    this.endpoint = new RpcEndpoint(options.wire, {
      onRequest: (method, params, signal) => this.dispatch(method, params, signal),
    });
    this.endpoint.emit('host.ready', { sdkVersion: options.sdkVersion });
  }

  /** Exposed for the in-process transport used by tests. */
  get rpc(): RpcEndpoint {
    return this.endpoint;
  }

  private async dispatch(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
    switch (method) {
      case 'plugin.activate':
        return this.activate(ActivatePluginParams.parse(params));
      case 'plugin.deactivate':
        return this.deactivate(DeactivatePluginParams.parse(params).pluginId);
      case 'node.execute': {
        const p = NodeExecuteParams.parse(params);
        const executor = this.active(p.pluginId).nodes.get(p.kind);
        if (!executor) throw pluginError('E_UNKNOWN_NODE', `No executor for node "${p.kind}"`);
        return executor.execute({ config: p.config, runtime: p.runtime, signal });
      }
      case 'request.execute': {
        const p = RequestExecuteParams.parse(params);
        const provider = this.active(p.pluginId).requestTypes.get(p.type);
        if (!provider) {
          throw pluginError('E_UNKNOWN_REQUEST_TYPE', `No provider for request type "${p.type}"`);
        }
        return provider.execute({
          payload: p.payload,
          ...(p.artifacts ? { artifacts: p.artifacts } : {}),
          options: p.options,
          signal,
        });
      }
      case 'auth.apply': {
        const p = AuthApplyParams.parse(params);
        const provider = this.active(p.pluginId).authProviders.get(p.type);
        if (!provider) {
          throw pluginError('E_UNKNOWN_AUTH_PROVIDER', `No provider for auth type "${p.type}"`);
        }
        return provider.apply({ config: p.config, ctx: p.ctx });
      }
      case 'importer.detect': {
        const p = ImporterDetectParams.parse(params);
        const importer = this.active(p.pluginId).importers.get(p.id);
        if (!importer) throw pluginError('E_UNKNOWN_IMPORTER', `No importer "${p.id}"`);
        try {
          return { matches: importer.detect(p.content) };
        } catch {
          return { matches: false };
        }
      }
      case 'importer.parse': {
        const p = ImporterParseParams.parse(params);
        const importer = this.active(p.pluginId).importers.get(p.id);
        if (!importer) throw pluginError('E_UNKNOWN_IMPORTER', `No importer "${p.id}"`);
        const collection = await importer.parse({
          content: p.content,
          ...(p.sourceName ? { sourceName: p.sourceName } : {}),
          signal,
        });
        return { spec: toNormalizedSpec(collection, `plugin:${p.pluginId}/${p.id}`) };
      }
      default:
        throw pluginError('E_UNKNOWN_METHOD', `Unknown RPC method: ${method}`);
    }
  }

  private active(pluginId: string): ActivePlugin {
    const entry = this.plugins.get(pluginId);
    if (!entry) throw pluginError('E_PLUGIN_NOT_ACTIVE', `Plugin not active: ${pluginId}`);
    return entry;
  }

  private async activate(params: ActivatePluginParams): Promise<unknown> {
    if (this.plugins.has(params.pluginId)) {
      await this.deactivate(params.pluginId);
    }

    let exported: unknown;
    try {
      exported = this.options.loadModule(params.entryPath);
    } catch (error) {
      throw pluginError('E_PLUGIN_LOAD', `Entry failed to load: ${(error as Error).message}`);
    }
    const plugin = resolvePluginExport(exported);
    if (!plugin) {
      throw pluginError(
        'E_PLUGIN_SHAPE',
        'Entry module must default-export a plugin with an activate() function',
      );
    }

    const entry: ActivePlugin = {
      pluginId: params.pluginId,
      plugin,
      nodes: new Map(),
      requestTypes: new Map(),
      authProviders: new Map(),
      importers: new Map(),
    };

    const context: PluginContext = buildPluginContext({
      pluginId: params.pluginId,
      manifest: params.manifest,
      grantedCapabilities: params.grantedCapabilities,
      registry: entry,
      call: (method, callParams) => this.endpoint.call(method, callParams),
      emit: (topic, payload) => this.endpoint.emit(topic, payload),
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
    });

    try {
      await plugin.activate(context);
    } catch (error) {
      this.plugins.delete(params.pluginId);
      throw pluginError('E_PLUGIN_ACTIVATE', `activate() failed: ${(error as Error).message}`);
    }

    this.plugins.set(params.pluginId, entry);
    return {
      nodes: [...entry.nodes.keys()],
      requestTypes: [...entry.requestTypes.keys()],
      authProviders: [...entry.authProviders.keys()],
      importers: [...entry.importers.keys()],
    };
  }

  private async deactivate(pluginId: string): Promise<Record<string, never>> {
    const entry = this.plugins.get(pluginId);
    if (!entry) return {};
    this.plugins.delete(pluginId);
    try {
      await entry.plugin.deactivate?.();
    } catch {
      // A failing deactivate must not block unload; the maps are already gone.
    }
    return {};
  }
}

function resolvePluginExport(exported: unknown): WorkbenchPlugin | undefined {
  const candidate =
    exported && typeof exported === 'object' && 'default' in exported
      ? (exported as { default: unknown }).default
      : exported;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as WorkbenchPlugin).activate === 'function'
  ) {
    return candidate as WorkbenchPlugin;
  }
  return undefined;
}

/** Maps the SDK's ImportedCollection to the shared NormalizedSpec contract. */
function toNormalizedSpec(
  collection: {
    title: string;
    version: string;
    baseUrl: string;
    operations: Array<{ method: string; path: string; url: string; name: string; tag: string | null }>;
  },
  specVersion: string,
): unknown {
  const tags = [...new Set(collection.operations.map((o) => o.tag).filter((t): t is string => !!t))];
  return {
    specVersion,
    title: collection.title,
    apiVersion: collection.version,
    baseUrl: collection.baseUrl,
    tags,
    operations: collection.operations.map((o) => ({
      method: o.method,
      path: o.path,
      url: o.url,
      name: o.name,
      tag: o.tag,
    })),
    schemaCount: 0,
    exampleCount: 0,
  };
}
