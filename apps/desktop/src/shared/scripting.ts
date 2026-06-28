import { z } from 'zod';
import { ExecutionResponse } from './execution';
import { VariableContext } from './variable';

/**
 * Transport DTOs for post-response scripting — a Postman-compatible `pm` sandbox
 * that can read the response and read/write scoped variables.
 */

/** Which Postman variable scope a script touched (mapped to our engine scopes). */
export const ScriptVarScope = z.enum(['global', 'environment', 'collection', 'local']);
export type ScriptVarScope = z.infer<typeof ScriptVarScope>;

export const ScriptVarChange = z.object({
  action: z.enum(['set', 'unset']),
  scope: ScriptVarScope,
  key: z.string(),
  value: z.string().optional(),
});
export type ScriptVarChange = z.infer<typeof ScriptVarChange>;

export const ScriptTestResult = z.object({
  name: z.string(),
  passed: z.boolean(),
  error: z.string().optional(),
});
export type ScriptTestResult = z.infer<typeof ScriptTestResult>;

export const ScriptRunRequest = z.object({
  script: z.string(),
  response: ExecutionResponse,
  context: VariableContext.optional(),
});
export type ScriptRunRequest = z.infer<typeof ScriptRunRequest>;

/** Read-only outgoing request info exposed to a pre-request script. */
export const ScriptRequestInfo = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string()),
});
export type ScriptRequestInfo = z.infer<typeof ScriptRequestInfo>;

export const PreScriptRunRequest = z.object({
  script: z.string(),
  request: ScriptRequestInfo,
  context: VariableContext.optional(),
});
export type PreScriptRunRequest = z.infer<typeof PreScriptRunRequest>;

export const ScriptRunResult = z.object({
  logs: z.array(z.string()),
  tests: z.array(ScriptTestResult),
  variables: z.array(ScriptVarChange),
  /** Set when the script threw outside of a pm.test() block. */
  error: z.string().optional(),
});
export type ScriptRunResult = z.infer<typeof ScriptRunResult>;
