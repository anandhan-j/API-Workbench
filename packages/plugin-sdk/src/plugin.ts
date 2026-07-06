import type { AuthProvider, Importer, NodeExecutor, RequestTypeProvider } from './extension-points';
import type { FormSchema, FormValues } from './forms';

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

/**
 * A dialog the host shows on the plugin's behalf. Pure data: the host renders
 * `message` and the declarative `form` with its own trusted UI (always naming
 * the plugin), and resolves with the submitted values — plugin code never
 * draws anything itself (ADR-0010). With no `form` the dialog is a plain
 * confirm and `values` comes back empty.
 */
export interface PluginDialogOptions {
  /** Dialog heading (defaults to the plugin's name). Max 80 chars. */
  title?: string;
  /** Body text above the form. Max 1000 chars. */
  message?: string;
  /** Fields to collect; same schema language as node config forms. */
  form?: FormSchema;
  /** Confirm-button label (default "OK"). */
  okLabel?: string;
  /** Cancel-button label (default "Cancel"). */
  cancelLabel?: string;
}

export interface PluginDialogOutcome {
  /** True when the user dismissed the dialog without confirming. */
  cancelled: boolean;
  /** Submitted values, validated against `form`; empty when cancelled. */
  values: FormValues;
}

/** Host-rendered UI; present only when the `ui:dialog` capability was granted. */
export interface PluginUi {
  /**
   * Shows a modal dialog and resolves once the user confirms or cancels.
   * Headless runs (no window) resolve as cancelled, so always handle that.
   */
  showDialog(options: PluginDialogOptions): Promise<PluginDialogOutcome>;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly log: PluginLogger;
  readonly storage: PluginStorage;
  /** Present iff `variables:read` or `variables:write` was granted. */
  readonly variables?: PluginVariables;
  /** Outbound HTTP; present iff the `network` capability was granted. */
  readonly fetch?: typeof fetch;
  /** Host-rendered dialogs; present iff the `ui:dialog` capability was granted. */
  readonly ui?: PluginUi;

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
