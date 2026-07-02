import { z } from 'zod';
import { Capability, PluginManifest } from './plugins';
import { ProtocolResponse } from './protocol';
import { AuthArtifacts } from './auth';
import { NormalizedSpec } from './openapi';

/**
 * The RPC protocol between the main process and the plugin host utility
 * process (Phase 16, ADR-0007/0010). Both directions use the same envelope:
 * requests carry a correlation id; responses echo it; `cancel` propagates an
 * AbortSignal; `event` is fire-and-forget (host.ready, log lines). The main
 * process Zod-validates every inbound message — the host is less trusted.
 *
 * Main→host methods: `plugin.activate`, `plugin.deactivate`, `node.execute`,
 * `request.execute`, `auth.apply`, `importer.detect`, `importer.parse`.
 * Host→main methods (capability calls): `cap.storage.get|set|delete`,
 * `cap.variables.resolve|set`. Grants are enforced per call in main.
 */

export const RPC_MAX_MESSAGE_BYTES = 10 * 1024 * 1024;

export const RpcError = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
});
export type RpcError = z.infer<typeof RpcError>;

// A plain union: `res` appears twice (ok/error variants), which a Zod
// discriminated union on `kind` cannot express.
export const RpcMessage = z.union([
  z.object({ kind: z.literal('req'), id: z.string(), method: z.string(), params: z.unknown() }),
  z.object({ kind: z.literal('res'), id: z.string(), ok: z.literal(true), result: z.unknown() }),
  z.object({ kind: z.literal('res'), id: z.string(), ok: z.literal(false), error: RpcError }),
  z.object({ kind: z.literal('cancel'), id: z.string() }),
  z.object({ kind: z.literal('event'), topic: z.string(), payload: z.unknown() }),
]);
export type RpcMessage = z.infer<typeof RpcMessage>;

// --- Main → host method payloads ---

export const ActivatePluginParams = z.object({
  pluginId: z.string(),
  entryPath: z.string(),
  grantedCapabilities: z.array(Capability),
  manifest: PluginManifest,
});
export type ActivatePluginParams = z.infer<typeof ActivatePluginParams>;

/** What the plugin's activate() registered, cross-checked against the manifest. */
export const ActivatePluginResult = z.object({
  nodes: z.array(z.string()),
  requestTypes: z.array(z.string()),
  authProviders: z.array(z.string()),
  importers: z.array(z.string()),
});
export type ActivatePluginResult = z.infer<typeof ActivatePluginResult>;

export const DeactivatePluginParams = z.object({ pluginId: z.string() });

export const NodeExecuteParams = z.object({
  pluginId: z.string(),
  kind: z.string(),
  config: z.record(z.unknown()),
  runtime: z.record(z.string()),
});
export const NodeExecuteResult = z.object({
  message: z.string().optional(),
  variables: z.record(z.string()).optional(),
  branch: z.string().optional(),
});
export type NodeExecuteResult = z.infer<typeof NodeExecuteResult>;

export const RequestExecuteParams = z.object({
  pluginId: z.string(),
  type: z.string(),
  payload: z.record(z.unknown()),
  artifacts: AuthArtifacts.optional(),
  options: z.object({ timeoutMs: z.number() }),
});
/** The host's raw result; main converts it into a full ProtocolResponse. */
export const RequestExecuteResult = z.object({
  ok: z.boolean(),
  summary: ProtocolResponse.shape.summary,
  metadata: z.record(z.string()).default({}),
  body: z.string(),
  bodyKind: ProtocolResponse.shape.bodyKind.default('text'),
  contentType: z.string().default(''),
  error: z.string().optional(),
  protocol: z.unknown().optional(),
});
export type RequestExecuteResult = z.infer<typeof RequestExecuteResult>;

export const AuthApplyParams = z.object({
  pluginId: z.string(),
  type: z.string(),
  config: z.record(z.unknown()),
  ctx: z.object({
    method: z.string().optional(),
    url: z.string(),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  }),
});
export const AuthApplyResult = AuthArtifacts;

export const ImporterDetectParams = z.object({
  pluginId: z.string(),
  id: z.string(),
  content: z.string(),
});
export const ImporterDetectResult = z.object({ matches: z.boolean() });

export const ImporterParseParams = z.object({
  pluginId: z.string(),
  id: z.string(),
  content: z.string(),
  sourceName: z.string().optional(),
});
/** Importers produce the shared normalized contract; main re-validates it. */
export const ImporterParseResult = z.object({ spec: NormalizedSpec });

// --- Host → main capability payloads ---

export const StorageGetParams = z.object({ pluginId: z.string(), key: z.string() });
export const StorageGetResult = z.object({ value: z.string().optional() });
export const StorageSetParams = z.object({
  pluginId: z.string(),
  key: z.string().max(256),
  value: z.string(),
});
export const StorageDeleteParams = StorageGetParams;

export const VariablesResolveParams = z.object({ pluginId: z.string(), template: z.string() });
export const VariablesResolveResult = z.object({ value: z.string() });
export const VariablesSetParams = z.object({
  pluginId: z.string(),
  scope: z.enum(['workspace', 'global']),
  key: z.string(),
  value: z.string(),
});

export const LogEventPayload = z.object({
  pluginId: z.string(),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string().max(2000),
  data: z.unknown().optional(),
});

export const HostReadyPayload = z.object({ sdkVersion: z.string() });

export const Empty = z.object({}).strict();

/** Per-method timeouts (ms) applied by the main-side RPC client. */
export const RPC_TIMEOUTS: Record<string, number> = {
  'plugin.activate': 10_000,
  'plugin.deactivate': 5_000,
  'auth.apply': 10_000,
  'importer.detect': 5_000,
  'importer.parse': 60_000,
  // node.execute / request.execute use the caller's policy timeout; this is the backstop.
  'node.execute': 600_000,
  'request.execute': 600_000,
};
