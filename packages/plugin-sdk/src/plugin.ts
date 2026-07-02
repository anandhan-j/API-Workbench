import type { AuthProvider, Importer, NodeExecutor, RequestTypeProvider } from './extension-points';

/**
 * The plugin entry contract. A plugin's `main` module default-exports a
 * {@link WorkbenchPlugin} (use {@link definePlugin} for type inference):
 *
 * ```ts
 * import { definePlugin } from '@api-workbench/plugin-sdk';
 *
 * export default definePlugin({
 *   activate(ctx) {
 *     ctx.registerNodeExecutor('uuid', { async execute() { ... } });
 *   },
 * });
 * ```
 *
 * `activate` must register exactly the contributions the manifest declares;
 * unregistered contributions fail activation and unmanifested registrations
 * are rejected (ADR-0007).
 */
export interface WorkbenchPlugin {
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface PluginLogger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/** Per-plugin persistent key/value storage (always available). */
export interface PluginStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Variable access; present only when the matching capability was granted. */
export interface PluginVariables {
  /** Substitutes `{{variables}}` in a template (requires `variables:read`). */
  resolve(template: string): Promise<string>;
  /** Sets a workspace/global variable (requires `variables:write`). */
  set(scope: 'workspace' | 'global', key: string, value: string): Promise<void>;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly log: PluginLogger;
  readonly storage: PluginStorage;
  /** Present iff `variables:read` or `variables:write` was granted. */
  readonly variables?: PluginVariables;
  /** Outbound HTTP; present iff the `network` capability was granted. */
  readonly fetch?: typeof fetch;

  /** Registers the executor for a node contribution declared in the manifest. */
  registerNodeExecutor(kind: string, executor: NodeExecutor): void;
  /** Registers the provider for a request-type contribution. */
  registerRequestType(type: string, provider: RequestTypeProvider): void;
  /** Registers the provider for an auth contribution. */
  registerAuthProvider(type: string, provider: AuthProvider): void;
  /** Registers the importer for an importer contribution. */
  registerImporter(id: string, importer: Importer): void;
}

/** Identity helper providing type inference for a plugin's default export. */
export function definePlugin(plugin: WorkbenchPlugin): WorkbenchPlugin {
  return plugin;
}
