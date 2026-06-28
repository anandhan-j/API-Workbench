import { z } from 'zod';

/**
 * Transport DTOs for the variable engine (Phase 8): scoped variables, the
 * masked variable shape sent to the renderer, the resolution context, and the
 * expression-evaluation request.
 *
 * Secret values NEVER cross the IPC boundary as plaintext. The renderer-facing
 * `Variable` DTO carries only a `hasValue` flag for secrets; the plaintext
 * `value` is omitted. Resolution and evaluation happen in the main process,
 * where decrypted values stay, and the renderer receives only evaluated strings
 * or non-secret keys.
 */

/** Variable scopes, ordered here by ascending precedence (see VariableService). */
export const VariableScope = z.enum([
  'global',
  'workspace',
  'collection',
  'folder',
  'request',
  'workflow',
  'runtime',
]);
export type VariableScope = z.infer<typeof VariableScope>;

/**
 * A variable as exposed to the renderer. `scopeId` is the empty string for the
 * global scope (which has no owning entity). For secret variables `value` is
 * omitted entirely and `hasValue` indicates whether a stored value exists; for
 * non-secret variables `value` carries the plaintext.
 */
export const Variable = z.object({
  id: z.string(),
  scope: VariableScope,
  scopeId: z.string(),
  key: z.string(),
  /** Present only for non-secret variables; omitted for secrets. */
  value: z.string().optional(),
  secret: z.boolean(),
  encrypted: z.boolean(),
  /** Whether a stored value exists (always meaningful, even when masked). */
  hasValue: z.boolean(),
  updatedAt: z.number(),
});
export type Variable = z.infer<typeof Variable>;

/** A fully resolved variable as used inside the main process (plaintext). */
export const ResolvedVariable = z.object({
  key: z.string(),
  value: z.string(),
  secret: z.boolean(),
});
export type ResolvedVariable = z.infer<typeof ResolvedVariable>;

/**
 * The scope chain a resolution walks. Only the levels present here are pulled;
 * absent levels are ignored. `runtime` is a plain key/value map that always wins.
 */
export const VariableContext = z.object({
  workspaceId: z.string().optional(),
  collectionId: z.string().optional(),
  folderId: z.string().optional(),
  requestId: z.string().optional(),
  workflowId: z.string().optional(),
  runtime: z.record(z.string()).optional(),
});
export type VariableContext = z.infer<typeof VariableContext>;

/** Input for setting a variable. */
export const SetVariableInput = z.object({
  scope: VariableScope,
  scopeId: z.string().optional(),
  key: z.string().min(1),
  value: z.string(),
  secret: z.boolean().optional(),
});
export type SetVariableInput = z.infer<typeof SetVariableInput>;

/** Request to evaluate a template against a resolution context. */
export const EvaluateRequest = z.object({
  template: z.string(),
  context: VariableContext.optional(),
});
export type EvaluateRequest = z.infer<typeof EvaluateRequest>;

/** A resolved key as exposed to the renderer (no secret plaintext). */
export const ResolvedKey = z.object({
  key: z.string(),
  secret: z.boolean(),
  scope: VariableScope,
});
export type ResolvedKey = z.infer<typeof ResolvedKey>;
