import { z } from 'zod';
import { HttpMethod } from './collection';
import { WireAuthConfig } from './auth';
import {
  BodyKind,
  ExecutionOptions,
  ExecutionTimings,
  RequestBody,
  VariableContext,
  type ExecutionResponse,
} from './execution';

/**
 * Protocol-agnostic request execution DTOs (Phase 16, ADR-0009).
 *
 * A {@link RequestEnvelope} carries a request of any type — `'http'` (built-in)
 * or a plugin-contributed `'plugin:<pluginId>/<type>'` — with the type-specific
 * fields in `payload`. Execution produces a {@link ProtocolResponse}: a shape
 * every protocol can fill (summary chip, header-like metadata map, body panes,
 * timings) plus a `protocol` bag for type-specific extras the HTTP UI renders.
 *
 * The legacy HTTP DTOs ({@link ExecutionResponse} et al.) remain the built-in
 * HTTP provider's internal types; `toProtocolResponse` maps them outward and
 * `liftLegacyHttpRequest` lifts pre-envelope payloads (older saved shapes and
 * callers) into envelopes, so existing data keeps working unchanged.
 */

/** `'http'` or a fully-qualified plugin request type (`plugin:<pluginId>/<type>`). */
export const RequestTypeId = z.string().min(1);
export type RequestTypeId = z.infer<typeof RequestTypeId>;

export const HTTP_REQUEST_TYPE = 'http';

/** The HTTP payload: the request fields minus the envelope-level concerns. */
export const HttpPayload = z.object({
  method: HttpMethod,
  url: z.string(),
  headers: z.record(z.string()).default({}),
  query: z.record(z.string()).default({}),
  body: RequestBody.default({ type: 'none' }),
});
export type HttpPayload = z.infer<typeof HttpPayload>;

const envelopeShape = {
  /** Optional id used to address a cancellation. */
  id: z.string().optional(),
  type: RequestTypeId.default(HTTP_REQUEST_TYPE),
  /** Type-specific request fields; validated by the resolved provider. */
  payload: z.unknown(),
  /** Inline auth config (wins over `credentialId`); built-in or plugin scheme. */
  auth: WireAuthConfig.optional(),
  /** A stored credential to apply (resolved/decrypted in the main process). */
  credentialId: z.string().optional(),
  options: ExecutionOptions.partial().optional(),
  /** Variable scope context for resolving {{vars}} in payload fields. */
  variableContext: VariableContext.optional(),
};

/**
 * Lifts a legacy flat HTTP request (`{method, url, ...}` at the top level, no
 * `type`/`payload`) into envelope shape. Non-legacy values pass through.
 */
export function liftLegacyHttpRequest(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  if ('payload' in record || 'type' in record) return value;
  if (!('method' in record) || !('url' in record)) return value;
  const { id, auth, credentialId, options, variableContext, ...payload } = record;
  return {
    ...(id !== undefined ? { id } : {}),
    type: HTTP_REQUEST_TYPE,
    payload,
    ...(auth !== undefined ? { auth } : {}),
    ...(credentialId !== undefined ? { credentialId } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(variableContext !== undefined ? { variableContext } : {}),
  };
}

export const RequestEnvelope = z.preprocess(liftLegacyHttpRequest, z.object(envelopeShape));
export type RequestEnvelope = z.infer<typeof RequestEnvelope>;

/** The one-line result chip every protocol can produce ('200 OK', 'DELIVERED'). */
export const ProtocolSummary = z.object({
  label: z.string(),
  tone: z.enum(['success', 'error', 'info']),
  /** Machine-readable code ('200'); what `status`-source extraction reads. */
  code: z.string().optional(),
});
export type ProtocolSummary = z.infer<typeof ProtocolSummary>;

/** HTTP's type-specific extras, carried in `ProtocolResponse.protocol`. */
export const HttpProtocolExtras = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string()),
  redirects: z.array(z.string()),
  retries: z.number(),
});
export type HttpProtocolExtras = z.infer<typeof HttpProtocolExtras>;

export const ProtocolResponse = z.object({
  type: RequestTypeId,
  ok: z.boolean(),
  summary: ProtocolSummary,
  /** Generic header-like display map (HTTP: response headers). */
  metadata: z.record(z.string()).default({}),
  /** Decoded text body, or base64 for binary. */
  body: z.string(),
  bodyKind: BodyKind,
  /** Pretty-printed body for display (JSON/XML), when applicable. */
  prettyBody: z.string().optional(),
  contentType: z.string().default(''),
  sizeBytes: z.number(),
  timings: ExecutionTimings,
  /** Set when the request failed before producing a response. */
  error: z.string().optional(),
  cancelled: z.boolean().optional(),
  /** Type-specific extras ({@link HttpProtocolExtras} for `'http'`). */
  protocol: z.unknown().optional(),
});
export type ProtocolResponse = z.infer<typeof ProtocolResponse>;

/** Maps the HTTP engine's response into the protocol-agnostic shape. */
export function toProtocolResponse(response: ExecutionResponse): ProtocolResponse {
  const extras: HttpProtocolExtras = {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    redirects: response.redirects,
    retries: response.retries,
  };
  const label = response.error
    ? (response.cancelled ? 'Cancelled' : 'Error')
    : `${response.status} ${response.statusText}`.trim();
  return {
    type: HTTP_REQUEST_TYPE,
    ok: response.ok,
    summary: {
      label,
      tone: response.ok ? 'success' : response.cancelled ? 'info' : 'error',
      code: String(response.status),
    },
    metadata: response.headers,
    body: response.body,
    bodyKind: response.bodyKind,
    ...(response.prettyBody !== undefined ? { prettyBody: response.prettyBody } : {}),
    contentType: response.contentType,
    sizeBytes: response.sizeBytes,
    timings: response.timings,
    ...(response.error !== undefined ? { error: response.error } : {}),
    ...(response.cancelled !== undefined ? { cancelled: response.cancelled } : {}),
    protocol: extras,
  };
}

/** The numeric status of a response: HTTP status, or the parsed summary code. */
export function statusOf(response: ProtocolResponse): number {
  const extras = HttpProtocolExtras.safeParse(response.protocol);
  if (extras.success) return extras.data.status;
  const code = Number(response.summary.code);
  return Number.isFinite(code) ? code : 0;
}

/**
 * A flat, HTTP-flavoured view of a {@link ProtocolResponse} for consumers with
 * status/header semantics (assertions, `pm.response`, condition scripts). HTTP
 * responses read their real extras; other types degrade to the summary code
 * and metadata map, so protocol-agnostic tests still work.
 */
export interface HttpView {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  timings: z.infer<typeof ExecutionTimings>;
}

export function httpViewOf(response: ProtocolResponse): HttpView {
  const extras = HttpProtocolExtras.safeParse(response.protocol);
  return {
    status: extras.success ? extras.data.status : statusOf(response),
    statusText: extras.success ? extras.data.statusText : response.summary.label,
    ok: response.ok,
    headers: extras.success ? extras.data.headers : response.metadata,
    body: response.body,
    timings: response.timings,
  };
}
