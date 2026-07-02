import type { PluginContext } from '@api-workbench/plugin-sdk';
import type { Capability, PluginManifest } from '@shared/plugins';
import type { ActivePlugin } from './runtime';

/**
 * Builds the {@link PluginContext} handed to a plugin's `activate()`
 * (Phase 16, ADR-0007). Capability-gated members exist only when granted;
 * `storage`/`variables` are thin async proxies over `cap.*` RPCs to the main
 * process (the capability broker re-checks grants there — this gate is UX,
 * that one is security). `register*` only accepts keys the manifest declared.
 */

export interface SdkRuntimeDeps {
  pluginId: string;
  manifest: PluginManifest;
  grantedCapabilities: Capability[];
  registry: ActivePlugin;
  call(method: string, params: unknown): Promise<unknown>;
  emit(topic: string, payload: unknown): void;
  fetchImpl?: typeof fetch;
}

const BLOCKED_FETCH_PROTOCOLS = new Set(['file:', 'app:', 'chrome:', 'devtools:']);

export function buildPluginContext(deps: SdkRuntimeDeps): PluginContext {
  const { pluginId, manifest, grantedCapabilities, registry, call, emit } = deps;
  const granted = new Set(grantedCapabilities);

  const declared = {
    nodes: new Set(manifest.contributes.nodes.map((c) => c.kind)),
    requestTypes: new Set(manifest.contributes.requestTypes.map((c) => c.type)),
    authProviders: new Set(manifest.contributes.authProviders.map((c) => c.type)),
    importers: new Set(manifest.contributes.importers.map((c) => c.id)),
  };

  function assertDeclared(set: Set<string>, key: string, what: string): void {
    if (!set.has(key)) {
      throw new Error(`Cannot register ${what} "${key}": not declared in the manifest`);
    }
  }

  const log = (level: 'info' | 'warn' | 'error', message: string, data?: unknown): void =>
    emit('plugin.log', { pluginId, level, message, ...(data !== undefined ? { data } : {}) });

  const context: PluginContext = {
    pluginId,
    log: {
      info: (message, data) => log('info', message, data),
      warn: (message, data) => log('warn', message, data),
      error: (message, data) => log('error', message, data),
    },
    storage: {
      get: async (key) =>
        ((await call('cap.storage.get', { pluginId, key })) as { value?: string }).value,
      set: async (key, value) => {
        await call('cap.storage.set', { pluginId, key, value });
      },
      delete: async (key) => {
        await call('cap.storage.delete', { pluginId, key });
      },
    },
    registerNodeExecutor(kind, executor) {
      assertDeclared(declared.nodes, kind, 'node');
      registry.nodes.set(kind, executor);
    },
    registerRequestType(type, provider) {
      assertDeclared(declared.requestTypes, type, 'request type');
      registry.requestTypes.set(type, provider);
    },
    registerAuthProvider(type, provider) {
      assertDeclared(declared.authProviders, type, 'auth provider');
      registry.authProviders.set(type, provider);
    },
    registerImporter(id, importer) {
      assertDeclared(declared.importers, id, 'importer');
      registry.importers.set(id, importer);
    },
  };

  if (granted.has('variables:read') || granted.has('variables:write')) {
    Object.defineProperty(context, 'variables', {
      enumerable: true,
      value: {
        resolve: async (template: string) => {
          if (!granted.has('variables:read')) {
            throw new Error('The variables:read capability was not granted');
          }
          return ((await call('cap.variables.resolve', { pluginId, template })) as { value: string })
            .value;
        },
        set: async (scope: 'workspace' | 'global', key: string, value: string) => {
          if (!granted.has('variables:write')) {
            throw new Error('The variables:write capability was not granted');
          }
          await call('cap.variables.set', { pluginId, scope, key, value });
        },
      },
    });
  }

  if (granted.has('network')) {
    const backing = deps.fetchImpl ?? fetch;
    Object.defineProperty(context, 'fetch', {
      enumerable: true,
      value: ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (BLOCKED_FETCH_PROTOCOLS.has(url.protocol)) {
          return Promise.reject(new Error(`Blocked protocol: ${url.protocol}`));
        }
        return backing(input, init);
      }) as typeof fetch,
    });
  }

  return context;
}
