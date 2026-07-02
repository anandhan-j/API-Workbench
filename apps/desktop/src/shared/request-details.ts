import { z } from 'zod';
import { HttpMethod } from './collection';
import { WireAuthConfig } from './auth';

/**
 * Persisted request definition (Phase: request persistence).
 *
 * Beyond a request's identity (method/url/name, which live as columns), a request
 * carries the editable definition a user works with: headers, query params, body,
 * auth, and execution options. This is stored as a single JSON `details` blob so
 * the request editor can round-trip — populated automatically from the OpenAPI
 * spec on import, then saved back whenever the user edits it.
 */

/**
 * One editable key/value pair (header, query param, or form field). Form-data
 * fields may be a file: `kind: 'file'` carries the picked file's name and its
 * base64 content instead of a text value.
 */
export const KeyValueEntry = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
  kind: z.enum(['text', 'file']).optional(),
  fileName: z.string().optional(),
  fileBase64: z.string().optional(),
});
export type KeyValueEntry = z.infer<typeof KeyValueEntry>;

export const BodyMode = z.enum(['none', 'raw', 'urlencoded', 'formdata', 'binary']);
export type BodyMode = z.infer<typeof BodyMode>;

export const RawType = z.enum(['json', 'text', 'xml']);
export type RawType = z.infer<typeof RawType>;

export const RequestBodyDef = z.object({
  mode: BodyMode.default('none'),
  rawType: RawType.default('json'),
  rawBody: z.string().default(''),
  formFields: z.array(KeyValueEntry).default([]),
  binaryBase64: z.string().default(''),
  binaryFileName: z.string().default(''),
});
export type RequestBodyDef = z.infer<typeof RequestBodyDef>;

export const RequestOptionsDef = z.object({
  timeoutMs: z.number().default(30_000),
  maxRetries: z.number().default(0),
  followRedirects: z.boolean().default(true),
});
export type RequestOptionsDef = z.infer<typeof RequestOptionsDef>;

const DEFAULT_BODY: RequestBodyDef = {
  mode: 'none',
  rawType: 'json',
  rawBody: '',
  formFields: [],
  binaryBase64: '',
  binaryFileName: '',
};
const DEFAULT_OPTIONS: RequestOptionsDef = { timeoutMs: 30_000, maxRetries: 0, followRedirects: true };

export const RequestDetails = z.object({
  headers: z.array(KeyValueEntry).default([]),
  params: z.array(KeyValueEntry).default([]),
  auth: WireAuthConfig.default({ type: 'none' }),
  body: RequestBodyDef.default(DEFAULT_BODY),
  options: RequestOptionsDef.default(DEFAULT_OPTIONS),
  /** Pre-request script run before the request is sent. */
  preRequestScript: z.string().default(''),
  /** Post-response (Postman "Tests") script run after a successful send. */
  postResponseScript: z.string().default(''),
  description: z.string().optional(),
  /**
   * Editor values for a plugin request type (ADR-0009), captured by its
   * schema-driven form. Unused (absent) for HTTP requests, whose editable
   * definition is the structured fields above.
   */
  pluginPayload: z.record(z.unknown()).optional(),
});
export type RequestDetails = z.infer<typeof RequestDetails>;

/** A fully-populated, default-filled empty definition. */
export function emptyDetails(): RequestDetails {
  return RequestDetails.parse({});
}

/** A request with its full, editable definition (the request editor's source). */
export const RequestDetailFull = z.object({
  id: z.string(),
  collectionId: z.string(),
  folderId: z.string().nullable(),
  name: z.string(),
  /** Request type (ADR-0009): 'http' or `plugin:<pluginId>/<type>`. */
  type: z.string().default('http'),
  method: HttpMethod,
  url: z.string(),
  favorite: z.boolean(),
  details: RequestDetails,
});
export type RequestDetailFull = z.infer<typeof RequestDetailFull>;

/** Saves an edited request: identity patch plus the full definition. */
export const SaveRequestInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  /** Request type (ADR-0009): 'http' or `plugin:<pluginId>/<type>`. Omitted leaves it unchanged. */
  type: z.string().optional(),
  method: HttpMethod.optional(),
  url: z.string().optional(),
  details: RequestDetails,
});
export type SaveRequestInput = z.infer<typeof SaveRequestInput>;
