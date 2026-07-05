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
export const GRAPHQL_REQUEST_TYPE = 'graphql';
export const GRPC_REQUEST_TYPE = 'grpc';
export const WEBSOCKET_REQUEST_TYPE = 'websocket';
export const SSE_REQUEST_TYPE = 'sse';

/** Every request type shipped in the app itself (not plugin-contributed). */
export const BUILTIN_REQUEST_TYPES = [
  HTTP_REQUEST_TYPE,
  GRAPHQL_REQUEST_TYPE,
  GRPC_REQUEST_TYPE,
  WEBSOCKET_REQUEST_TYPE,
  SSE_REQUEST_TYPE,
] as const;

/** The HTTP payload: the request fields minus the envelope-level concerns. */
export const HttpPayload = z.object({
  method: HttpMethod,
  url: z.string(),
  headers: z.record(z.string()).default({}),
  query: z.record(z.string()).default({}),
  body: RequestBody.default({ type: 'none' }),
});
export type HttpPayload = z.infer<typeof HttpPayload>;

/** GraphQL over HTTP: a POST of `{query, variables, operationName}`. */
export const GraphqlPayload = z.object({
  url: z.string(),
  query: z.string().default(''),
  /** Operation variables as JSON text — editor-friendly, `{{vars}}` survive. */
  variables: z.string().default(''),
  operationName: z.string().default(''),
  headers: z.record(z.string()).default({}),
});
export type GraphqlPayload = z.infer<typeof GraphqlPayload>;

/** gRPC unary call described by an on-disk `.proto` definition. */
export const GrpcPayload = z.object({
  /** `host:port` channel target. */
  target: z.string(),
  /** Absolute path to the `.proto` file defining the service. */
  protoFile: z.string(),
  /** Extra include directories for `import` resolution. */
  importDirs: z.array(z.string()).default([]),
  /** Fully-qualified service name (`pkg.Service`). */
  service: z.string(),
  method: z.string(),
  /** Request message as JSON text. */
  message: z.string().default('{}'),
  metadata: z.record(z.string()).default({}),
  useTls: z.boolean().default(false),
  deadlineMs: z.number().int().positive().default(30_000),
});
export type GrpcPayload = z.infer<typeof GrpcPayload>;

/** When a one-shot stream collection stops, whichever limit is hit first. */
export const CollectSettings = z.object({
  maxEvents: z.number().int().positive().default(50),
  durationMs: z.number().int().positive().default(10_000),
});
export type CollectSettings = z.infer<typeof CollectSettings>;

/** WebSocket session run in one-shot collect mode. */
export const WebSocketPayload = z.object({
  /** `ws://` or `wss://` URL. */
  url: z.string(),
  headers: z.record(z.string()).default({}),
  subprotocols: z.array(z.string()).default([]),
  /** Messages sent after the connection opens, each after its delay. */
  messages: z
    .array(z.object({ data: z.string(), delayMs: z.number().min(0).default(0) }))
    .default([]),
  collect: CollectSettings.default({}),
});
export type WebSocketPayload = z.infer<typeof WebSocketPayload>;

/** Server-Sent Events subscription run in one-shot collect mode. */
export const SsePayload = z.object({
  url: z.string(),
  method: z.enum(['GET', 'POST']).default('GET'),
  headers: z.record(z.string()).default({}),
  /** Request body sent when `method` is POST. */
  body: z.string().default(''),
  collect: CollectSettings.default({}),
});
export type SsePayload = z.infer<typeof SsePayload>;

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

/**
 * GraphQL's extras: a superset of {@link HttpProtocolExtras} (the operation
 * rides on HTTP), so `statusOf`/`httpViewOf` and status assertions work
 * unchanged, plus the operation's top-level `errors`.
 */
export const GraphqlProtocolExtras = HttpProtocolExtras.extend({
  graphqlErrors: z
    .array(
      z.object({
        message: z.string(),
        path: z.array(z.union([z.string(), z.number()])).optional(),
      }),
    )
    .default([]),
});
export type GraphqlProtocolExtras = z.infer<typeof GraphqlProtocolExtras>;

/** gRPC's extras: the call status and both metadata maps. */
export const GrpcProtocolExtras = z.object({
  /** gRPC status code; `0` is OK. */
  statusCode: z.number(),
  /** Status name (`OK`, `NOT_FOUND`, …). */
  statusName: z.string(),
  metadata: z.record(z.string()),
  trailers: z.record(z.string()),
});
export type GrpcProtocolExtras = z.infer<typeof GrpcProtocolExtras>;

/** One frame/event in a stream session's timeline. */
export const StreamEvent = z.object({
  /** Epoch ms. */
  at: z.number(),
  direction: z.enum(['sent', 'received', 'info', 'error']),
  /** WS: `text`/`binary`/`open`/`close`; SSE: the event name. */
  kind: z.string().default('message'),
  data: z.string(),
});
export type StreamEvent = z.infer<typeof StreamEvent>;

/** WebSocket/SSE extras: the full directional event timeline. */
export const StreamProtocolExtras = z.object({
  events: z.array(StreamEvent),
  closeCode: z.number().optional(),
  closeReason: z.string().optional(),
  /** Set when collection stopped at `maxEvents`/`durationMs`, not close. */
  truncated: z.boolean().optional(),
});
export type StreamProtocolExtras = z.infer<typeof StreamProtocolExtras>;

/** Lifecycle of an interactive connection session (Phase 7). */
export const ConnectionState = z.enum(['connecting', 'open', 'closed', 'error']);
export type ConnectionState = z.infer<typeof ConnectionState>;

/** A frame pushed to the renderer for a live session. */
export const ConnectionEvent = z.object({
  sessionId: z.string(),
  event: StreamEvent,
});
export type ConnectionEvent = z.infer<typeof ConnectionEvent>;

/** A session lifecycle transition pushed to the renderer. */
export const ConnectionStateEvent = z.object({
  sessionId: z.string(),
  state: ConnectionState,
  code: z.number().optional(),
  reason: z.string().optional(),
  error: z.string().optional(),
});
export type ConnectionStateEvent = z.infer<typeof ConnectionStateEvent>;

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
