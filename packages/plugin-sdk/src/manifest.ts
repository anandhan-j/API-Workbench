import type { Capability } from './capabilities';
import type { FormSchema } from './forms';

/**
 * The plugin manifest — `manifest.json` at the root of a plugin package.
 * Everything the host needs to list, install, and render a plugin's
 * contributions is declared here; only behavior lives in the entry module.
 *
 * Mirrors the host's Zod authority (`shared/plugins.ts` in the desktop app).
 */

/**
 * One field a node prompts the user for before its executor runs (see
 * {@link NodeContribution.input}). `kind` picks the prompt control (defaults
 * to `'string'`); `variable` is the runtime variable the submitted value is
 * written to; `default` is a template pre-filling the prompt (for `boolean`
 * the literal `'true'`). `select`/`keyvalue` are prompted as dropdowns of
 * their preset `options`/`entries` (keyvalue: key = label shown, value = what
 * is stored; each a template, evaluated like `default`) and submit the single
 * chosen value. With `filledAtRuntime: true` they instead show a growable
 * list / key-value editor at run time and submit JSON (runtime variables are
 * strings; `number`/`boolean` likewise submit their string form).
 */
export interface NodePromptField {
  kind?: 'string' | 'secret' | 'number' | 'boolean' | 'select' | 'keyvalue';
  variable: string;
  label?: string;
  default?: string;
  options?: string[];
  entries?: Record<string, string>;
  filledAtRuntime?: boolean;
  /** The prompt refuses submission while the field is empty. */
  required?: boolean;
}

/**
 * How a node declares a runtime variable its executor writes, so the editor can
 * offer it in `{{…}}` autocomplete on later steps without running the plugin.
 * `config`: the variable name is the value the user typed into config field
 * `key`. `literal`: the node always writes a fixed variable `name`.
 */
export type NodeVariableOutput =
  | { source: 'config'; key: string }
  | { source: 'literal'; name: string };

/** A custom workflow node. Addressed at runtime as `plugin:<pluginId>/<kind>`. */
export interface NodeContribution {
  /** Unqualified kind, `[a-z][a-z0-9-]*`. */
  kind: string;
  label: string;
  description?: string;
  /** Named lucide icon (host allowlist; falls back to a puzzle piece). */
  icon?: string;
  category?: string;
  configSchema: FormSchema;
  /** Whether this node routes along labelled branches. Defaults to false. */
  branching?: boolean;
  /**
   * When present, the run prompts the user with these fields *before* this
   * node's executor runs (the same native modal the built-in user-input node
   * shows) and merges the collected values into the run's runtime — the
   * executor then reads them from `runtime` and they're set as the node's
   * variables. The host renders the prompt; plugin code never drives UI. Each
   * `default` is a template evaluated against the run before prompting.
   */
  input?: {
    message?: string;
    fields: NodePromptField[];
  };
  /**
   * Runtime variables this node writes, declared so later steps can reference
   * them in `{{…}}` autocomplete. Prompted `input` fields are already counted;
   * use this for variables the executor writes from its config.
   */
  producesVariables?: NodeVariableOutput[];
}

/** A custom request type. Addressed at runtime as `plugin:<pluginId>/<type>`. */
export interface RequestTypeContribution {
  /** Unqualified type, `[a-z][a-z0-9-]*`. */
  type: string;
  label: string;
  icon?: string;
  /** Drives the request editor for this type. */
  payloadSchema: FormSchema;
  /**
   * List/tree display: `badge` is a short literal shown where HTTP shows the
   * method (≤10 chars, e.g. "GRPC"); `targetKey` names the payload key whose
   * value is shown where HTTP shows the URL.
   */
  summary: { badge: string; targetKey: string };
  /**
   * When true, the request editor offers a live interactive session for this
   * type and the provider's `openConnection()` is used instead of `execute()`
   * (Phase 7). Omit for one-shot request/response types.
   */
  interactive?: boolean;
}

/** A custom auth provider. Addressed at runtime as `plugin:<pluginId>/<type>`. */
export interface AuthProviderContribution {
  /** Unqualified type, `[a-z][a-z0-9-]*`. */
  type: string;
  label: string;
  icon?: string;
  /** Drives the credential editor; `secret` fields are encrypted at rest. */
  configSchema: FormSchema;
}

/** A custom importer. Addressed at runtime as `plugin:<pluginId>/<id>`. */
export interface ImporterContribution {
  /** Unqualified id, `[a-z][a-z0-9-]*`. */
  id: string;
  label: string;
  sourceTypes: Array<'text' | 'url'>;
  /** Lowercase extensions with the dot, e.g. [".csv"]. */
  fileExtensions?: string[];
}

export interface PluginContributions {
  nodes?: NodeContribution[];
  requestTypes?: RequestTypeContribution[];
  authProviders?: AuthProviderContribution[];
  importers?: ImporterContribution[];
}

export interface PluginManifest {
  manifestVersion: 1;
  /** Reverse-DNS style id, e.g. "com.acme.tools". */
  id: string;
  name: string;
  /** The plugin's own semver. */
  version: string;
  description?: string;
  publisher?: string;
  homepage?: string;
  license?: string;
  /** Relative path to the bundled CommonJS entry, e.g. "dist/index.cjs". */
  main: string;
  engines: {
    /** Semver range the host's SDK version must satisfy, e.g. "^1.0.0". */
    sdk: string;
  };
  capabilities?: Capability[];
  contributes?: PluginContributions;
  /** Reserved for marketplace package signing; ignored in v1. */
  signature?: string;
}
