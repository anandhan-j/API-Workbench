import { z } from 'zod';
import { HttpMethod } from './collection';
import { AuthConfig } from './auth';

/**
 * Transport DTOs for the Request Execution Engine (Phase 10).
 */

export const RequestBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('text'), content: z.string(), contentType: z.string().optional() }),
  z.object({ type: z.literal('json'), content: z.string() }),
  z.object({
    type: z.literal('form'),
    fields: z.array(z.object({ name: z.string(), value: z.string() })),
  }),
  z.object({
    type: z.literal('multipart'),
    /** A text field (`value`) or a file field (`fileName` + base64 `base64`). */
    fields: z.array(
      z.object({
        name: z.string(),
        value: z.string().optional(),
        fileName: z.string().optional(),
        base64: z.string().optional(),
      }),
    ),
  }),
  z.object({ type: z.literal('binary'), base64: z.string(), contentType: z.string().optional() }),
]);
export type RequestBody = z.infer<typeof RequestBody>;

export const ExecutionOptions = z.object({
  timeoutMs: z.number().int().positive().default(30_000),
  maxRetries: z.number().int().min(0).default(0),
  retryBackoffMs: z.number().int().min(0).default(200),
  followRedirects: z.boolean().default(true),
  maxRedirects: z.number().int().min(0).default(5),
});
export type ExecutionOptions = z.infer<typeof ExecutionOptions>;

export const ExecutionRequest = z.object({
  /** Optional id used to address a cancellation. */
  id: z.string().optional(),
  method: HttpMethod,
  url: z.string(),
  headers: z.record(z.string()).default({}),
  query: z.record(z.string()).default({}),
  body: RequestBody.default({ type: 'none' }),
  auth: AuthConfig.optional(),
  /** A stored credential to apply (resolved/decrypted in the main process). */
  credentialId: z.string().optional(),
  options: ExecutionOptions.partial().optional(),
  /** Variable scope context for resolving {{vars}} in fields. */
  variableContext: z
    .object({
      workspaceId: z.string().optional(),
      collectionId: z.string().optional(),
      folderId: z.string().optional(),
      requestId: z.string().optional(),
      workflowId: z.string().optional(),
      runtime: z.record(z.string()).optional(),
    })
    .optional(),
});
export type ExecutionRequest = z.infer<typeof ExecutionRequest>;

export const BodyKind = z.enum(['json', 'xml', 'html', 'text', 'binary', 'empty']);
export type BodyKind = z.infer<typeof BodyKind>;

export const ExecutionTimings = z.object({
  startedAt: z.number(),
  totalMs: z.number(),
});
export type ExecutionTimings = z.infer<typeof ExecutionTimings>;

export const ExecutionResponse = z.object({
  ok: z.boolean(),
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string()),
  /** Decoded text body, or base64 for binary. */
  body: z.string(),
  bodyKind: BodyKind,
  /** Pretty-printed body for display (JSON/XML), when applicable. */
  prettyBody: z.string().optional(),
  contentType: z.string(),
  sizeBytes: z.number(),
  timings: ExecutionTimings,
  redirects: z.array(z.string()),
  retries: z.number(),
  /** Set when the request failed before producing an HTTP response. */
  error: z.string().optional(),
  cancelled: z.boolean().optional(),
});
export type ExecutionResponse = z.infer<typeof ExecutionResponse>;
