import { z } from 'zod';
import semverValid from 'semver/functions/valid';
import semverValidRange from 'semver/ranges/valid';
import { FormSchema } from './forms';

/**
 * Plugin manifest and contribution schemas (Phase 16, ADR-0007).
 *
 * This module is the validation authority for everything a plugin declares.
 * The public `@api-workbench/plugin-sdk` package mirrors these shapes as plain
 * TypeScript types for plugin authors; the desktop app trusts only this Zod.
 *
 * All UI-facing metadata (labels, icons, form schemas) is declarative and
 * carried in the manifest — the renderer renders contributions without ever
 * executing plugin code. Only behavior (execute/apply/parse) lives in the
 * plugin's entry module, which runs in the sandboxed plugin host process.
 */

/** The SDK contract version the desktop app implements (semver). */
export const SDK_VERSION = '1.0.0';

/** Reverse-DNS-ish plugin id: at least two dot-separated lowercase segments. */
export const PluginId = z
  .string()
  .min(3)
  .max(128)
  .regex(
    /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/,
    'Plugin id must be reverse-DNS style, e.g. "com.acme.tools"',
  );
export type PluginId = z.infer<typeof PluginId>;

const contributionKey = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** Capabilities a plugin may request; granted per-plugin by the user at install. */
export const Capability = z.enum(['network', 'variables:read', 'variables:write']);
export type Capability = z.infer<typeof Capability>;

/**
 * One field a node prompts the user for before its executor runs (see
 * {@link NodeContribution.input}). Mirrors the built-in user-input node's field
 * shape: `variable` is the runtime variable the submitted value is written to,
 * `default` is a template pre-filling the prompt, `secret` masks the input.
 */
export const NodePromptField = z.object({
  variable: z.string().min(1).max(60),
  label: z.string().max(80).default(''),
  default: z.string().max(2000).default(''),
  secret: z.boolean().default(false),
});
export type NodePromptField = z.infer<typeof NodePromptField>;

/**
 * How a node declares the runtime variables its executor writes, so the editor
 * can offer them in `{{…}}` autocomplete on later steps *without* running the
 * plugin. `config`: the variable name is the value the user typed into config
 * field `key` (e.g. the uuid node's "variable" field). `literal`: the node
 * always writes a fixed variable `name`. Values a plugin computes at runtime and
 * returns un-declared can't be surfaced statically.
 */
export const NodeVariableOutput = z.discriminatedUnion('source', [
  z.object({ source: z.literal('config'), key: z.string().min(1).max(60) }),
  z.object({ source: z.literal('literal'), name: z.string().min(1).max(60) }),
]);
export type NodeVariableOutput = z.infer<typeof NodeVariableOutput>;

export const NodeContribution = z.object({
  /** Unqualified kind; addressed at runtime as `plugin:<pluginId>/<kind>`. */
  kind: contributionKey,
  label: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  /** Named lucide icon, resolved against the renderer's allowlist (fallback: Puzzle). */
  icon: z.string().max(60).optional(),
  category: z.string().max(40).optional(),
  configSchema: FormSchema,
  /** Whether this node routes along labelled branches (`condition`-style). */
  branching: z.boolean().default(false),
  /**
   * When present, the run prompts the user with these fields *before* the
   * plugin's executor runs — the same native modal the built-in user-input node
   * shows — and merges the collected values into the run's runtime, so the
   * executor receives them in `runtime` and they are set as the node's
   * variables. Prompt rendering stays entirely in trusted host code; the plugin
   * never drives UI. Field `default`s are templates evaluated against the run
   * before prompting. Absent (headless) input port → the evaluated defaults are
   * used as-is.
   */
  input: z
    .object({
      message: z.string().max(300).default(''),
      fields: z.array(NodePromptField).max(20),
    })
    .optional(),
  /**
   * Runtime variables this node writes, declared so later steps can reference
   * them in `{{…}}` autocomplete. Prompted `input` fields are already counted;
   * use this for variables the executor writes from its config (see
   * {@link NodeVariableOutput}).
   */
  producesVariables: z.array(NodeVariableOutput).max(20).default([]),
});
export type NodeContribution = z.infer<typeof NodeContribution>;

export const RequestTypeContribution = z.object({
  /** Unqualified type; addressed at runtime as `plugin:<pluginId>/<type>`. */
  type: contributionKey,
  label: z.string().min(1).max(60),
  icon: z.string().max(60).optional(),
  /** Drives the request editor for this type. */
  payloadSchema: FormSchema,
  /**
   * Which payload keys summarize a request for list/tree display: `badge`
   * (method-column, e.g. "GRPC") is a literal; `target` names a payload key
   * whose value fills the url column.
   */
  summary: z.object({ badge: z.string().min(1).max(10), targetKey: z.string() }),
});
export type RequestTypeContribution = z.infer<typeof RequestTypeContribution>;

export const AuthProviderContribution = z.object({
  /** Unqualified type; addressed at runtime as `plugin:<pluginId>/<type>`. */
  type: contributionKey,
  label: z.string().min(1).max(60),
  icon: z.string().max(60).optional(),
  /** Drives the credential editor; `secret` fields are encrypted at rest. */
  configSchema: FormSchema,
});
export type AuthProviderContribution = z.infer<typeof AuthProviderContribution>;

export const ImporterContribution = z.object({
  /** Unqualified id; addressed at runtime as `plugin:<pluginId>/<id>`. */
  id: contributionKey,
  label: z.string().min(1).max(60),
  sourceTypes: z.array(z.enum(['text', 'url'])).min(1),
  fileExtensions: z.array(z.string().regex(/^\.[a-z0-9]+$/)).default([]),
});
export type ImporterContribution = z.infer<typeof ImporterContribution>;

const MAX_CONTRIBUTIONS_PER_TYPE = 20;

export const PluginContributions = z.object({
  nodes: z.array(NodeContribution).max(MAX_CONTRIBUTIONS_PER_TYPE).default([]),
  requestTypes: z.array(RequestTypeContribution).max(MAX_CONTRIBUTIONS_PER_TYPE).default([]),
  authProviders: z.array(AuthProviderContribution).max(MAX_CONTRIBUTIONS_PER_TYPE).default([]),
  importers: z.array(ImporterContribution).max(MAX_CONTRIBUTIONS_PER_TYPE).default([]),
});
export type PluginContributions = z.infer<typeof PluginContributions>;

export const PluginManifest = z.object({
  manifestVersion: z.literal(1),
  id: PluginId,
  name: z.string().min(1).max(80),
  version: z.string().refine((v) => semverValid(v) !== null, 'version must be valid semver'),
  description: z.string().max(500).optional(),
  publisher: z.string().max(80).optional(),
  homepage: z.string().url().optional(),
  license: z.string().max(40).optional(),
  /** Relative path to the bundled CommonJS entry, e.g. "dist/index.cjs". */
  main: z.string().min(1),
  engines: z.object({
    /** Semver range against {@link SDK_VERSION}, e.g. "^1.0.0". */
    sdk: z.string().refine((r) => semverValidRange(r) !== null, 'engines.sdk must be a semver range'),
  }),
  capabilities: z.array(Capability).default([]),
  contributes: PluginContributions.default({}),
  /** Reserved for marketplace package signing; ignored in v1. */
  signature: z.string().optional(),
});
export type PluginManifest = z.infer<typeof PluginManifest>;

// --- Installed-plugin DTOs (IPC surface) ---

export const PluginHostStatus = z.enum(['active', 'disabled', 'error', 'host-failed']);
export type PluginHostStatus = z.infer<typeof PluginHostStatus>;

/** An installed plugin as listed in the Plugins page. */
export const InstalledPlugin = z.object({
  id: PluginId,
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  publisher: z.string().optional(),
  enabled: z.boolean(),
  devMode: z.boolean(),
  grantedCapabilities: z.array(Capability),
  status: PluginHostStatus,
  /** Present when status is 'error' / 'host-failed'. */
  statusMessage: z.string().optional(),
  installedAt: z.number(),
  updatedAt: z.number(),
});
export type InstalledPlugin = z.infer<typeof InstalledPlugin>;

/** Dry-run of a manifest for the install-confirmation dialog. */
export const PluginInspection = z.object({
  manifest: PluginManifest,
  /** Set when a plugin with this id is already installed (upgrade flow). */
  installedVersion: z.string().optional(),
});
export type PluginInspection = z.infer<typeof PluginInspection>;

// Constrain to `ZodTypeAny` (not `ZodType<T>`) so the wrapped schema keeps its
// full input/output types through the intersection; otherwise the nested
// FormSchema collapses to its input shape (optional `required`/`substituteVariables`)
// and every SchemaForm consumer sees the wrong, looser type.
const qualified = <S extends z.ZodTypeAny>(schema: S) =>
  z.object({ pluginId: PluginId, pluginName: z.string() }).and(schema);

/**
 * Aggregated, fully-qualified contributions from every enabled plugin — the
 * renderer's single source for all dynamic UI (palette, editors, pickers).
 * `kind`/`type`/`id` fields inside each entry remain unqualified; consumers
 * derive the runtime id as `plugin:<pluginId>/<key>`.
 */
export const PluginContributionIndex = z.object({
  nodes: z.array(qualified(NodeContribution)),
  requestTypes: z.array(qualified(RequestTypeContribution)),
  authProviders: z.array(qualified(AuthProviderContribution)),
  importers: z.array(qualified(ImporterContribution)),
});
export type PluginContributionIndex = z.infer<typeof PluginContributionIndex>;

/** Runtime id of a contribution: `plugin:<pluginId>/<key>`. */
export function qualifiedContributionId(pluginId: string, key: string): string {
  return `plugin:${pluginId}/${key}`;
}
