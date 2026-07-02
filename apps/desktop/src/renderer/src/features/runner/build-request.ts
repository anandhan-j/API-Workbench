import type { RequestBody } from '@shared/execution';
import { HTTP_REQUEST_TYPE, type HttpPayload, type RequestEnvelope } from '@shared/protocol';
import type { AuthConfig } from '@shared/auth';
import type { HttpMethod } from '@shared/collection';
import type { VariableContext } from '@shared/variable';
import type { KeyValueEntry, RequestDetailFull, RequestDetails } from '@shared/request-details';

/** A single editable key/value row (params, headers, form fields). */
export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  /** form-data only: a text field or an attached file. */
  kind?: 'text' | 'file';
  fileName?: string;
  fileBase64?: string;
}

export type BodyMode = 'none' | 'raw' | 'urlencoded' | 'formdata' | 'binary';
export type RawType = 'json' | 'text' | 'xml';

/**
 * A plugin auth provider's config (ADR-0007): its fully-qualified type
 * (`plugin:<pluginId>/<type>`) plus the values captured by its form schema.
 */
export type PluginAuthConfig = { type: string } & Record<string, unknown>;

/** What the auth editor edits: a built-in scheme or a plugin provider config. */
export type EditorAuthConfig = AuthConfig | PluginAuthConfig;

/** Full editor state for one request. */
export interface RequestDraft {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: EditorAuthConfig;
  /**
   * Request type (ADR-0009): a qualified plugin type (`plugin:<pluginId>/<type>`)
   * switches the editor to the contribution's payload form; absent = HTTP.
   */
  requestType?: string;
  /** Values captured by a plugin request type's payload form. */
  pluginPayload?: Record<string, unknown>;
  bodyMode: BodyMode;
  rawType: RawType;
  rawBody: string;
  formFields: KeyValue[];
  binaryBase64: string;
  binaryFileName: string;
  preRequestScript: string;
  postResponseScript: string;
  options: { timeoutMs: number; maxRetries: number; followRedirects: boolean };
}

export function newRow(): KeyValue {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true };
}

export function defaultDraft(method: HttpMethod = 'GET', url = ''): RequestDraft {
  return {
    method,
    url,
    params: [newRow()],
    headers: [newRow()],
    auth: { type: 'none' },
    bodyMode: 'none',
    rawType: 'json',
    rawBody: '',
    formFields: [newRow()],
    binaryBase64: '',
    binaryFileName: '',
    preRequestScript: '',
    postResponseScript: '',
    options: { timeoutMs: 30_000, maxRetries: 0, followRedirects: true },
  };
}

function activePairs(rows: KeyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.enabled && row.key.trim()) out[row.key.trim()] = row.value;
  }
  return out;
}

function buildBody(draft: RequestDraft): RequestBody {
  switch (draft.bodyMode) {
    case 'none':
      return { type: 'none' };
    case 'raw':
      if (draft.rawType === 'json') return { type: 'json', content: draft.rawBody };
      return {
        type: 'text',
        content: draft.rawBody,
        contentType: draft.rawType === 'xml' ? 'application/xml' : 'text/plain',
      };
    case 'urlencoded':
      return {
        type: 'form',
        fields: draft.formFields
          .filter((f) => f.enabled && f.key.trim())
          .map((f) => ({ name: f.key.trim(), value: f.value })),
      };
    case 'formdata':
      return {
        type: 'multipart',
        fields: draft.formFields
          .filter((f) => f.enabled && f.key.trim())
          .map((f) =>
            f.kind === 'file'
              ? { name: f.key.trim(), fileName: f.fileName ?? 'file', base64: f.fileBase64 ?? '' }
              : { name: f.key.trim(), value: f.value },
          ),
      };
    case 'binary':
      return { type: 'binary', base64: draft.binaryBase64 };
    default:
      return { type: 'none' };
  }
}

/** Editor rows from persisted entries, with a trailing blank row for editing. */
function toRows(entries: KeyValueEntry[]): KeyValue[] {
  const rows: KeyValue[] = entries.map((e) => ({
    id: crypto.randomUUID(),
    key: e.key,
    value: e.value,
    enabled: e.enabled,
    ...(e.kind ? { kind: e.kind } : {}),
    ...(e.fileName !== undefined ? { fileName: e.fileName } : {}),
    ...(e.fileBase64 !== undefined ? { fileBase64: e.fileBase64 } : {}),
  }));
  rows.push(newRow());
  return rows;
}

/** Persisted entries from editor rows (drops the trailing blank). */
function fromRows(rows: KeyValue[]): KeyValueEntry[] {
  return rows
    .filter((r) => r.key.trim() || r.value.trim() || r.fileBase64)
    .map((r) => ({
      key: r.key,
      value: r.value,
      enabled: r.enabled,
      ...(r.kind ? { kind: r.kind } : {}),
      ...(r.fileName !== undefined ? { fileName: r.fileName } : {}),
      ...(r.fileBase64 !== undefined ? { fileBase64: r.fileBase64 } : {}),
    }));
}

/** Builds editor state from a persisted request definition. */
export function detailToDraft(detail: RequestDetailFull): RequestDraft {
  const d = detail.details;
  return {
    method: detail.method,
    url: detail.url,
    params: toRows(d.params),
    headers: toRows(d.headers),
    auth: d.auth,
    ...(detail.type && detail.type !== HTTP_REQUEST_TYPE ? { requestType: detail.type } : {}),
    ...(d.pluginPayload ? { pluginPayload: d.pluginPayload } : {}),
    bodyMode: d.body.mode,
    rawType: d.body.rawType,
    rawBody: d.body.rawBody,
    formFields: toRows(d.body.formFields),
    binaryBase64: d.body.binaryBase64,
    binaryFileName: d.body.binaryFileName,
    preRequestScript: d.preRequestScript,
    postResponseScript: d.postResponseScript,
    options: d.options,
  };
}

/** Serializes editor state into the persisted request definition. */
export function draftToDetails(draft: RequestDraft): RequestDetails {
  return {
    headers: fromRows(draft.headers),
    params: fromRows(draft.params),
    auth: draft.auth as AuthConfig,
    ...(isPluginDraft(draft) ? { pluginPayload: draft.pluginPayload ?? {} } : {}),
    body: {
      mode: draft.bodyMode,
      rawType: draft.rawType,
      rawBody: draft.rawBody,
      formFields: fromRows(draft.formFields),
      binaryBase64: draft.binaryBase64,
      binaryFileName: draft.binaryFileName,
    },
    preRequestScript: draft.preRequestScript,
    postResponseScript: draft.postResponseScript,
    options: draft.options,
  };
}

/**
 * Parses the query string of a URL into editor rows. Values are kept raw (not
 * percent-decoded) so variable tokens like `{{id}}` survive round-trips.
 */
export function parseQueryParams(url: string): KeyValue[] {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return [];
  const query = url.slice(qIndex + 1).split('#')[0];
  if (!query) return [];
  return query
    .split('&')
    .filter((part) => part.length > 0)
    .map((part) => {
      const eq = part.indexOf('=');
      const key = eq === -1 ? part : part.slice(0, eq);
      const value = eq === -1 ? '' : part.slice(eq + 1);
      return { id: crypto.randomUUID(), key, value, enabled: true };
    });
}

/**
 * Rewrites a URL's query string from editor rows, preserving the path/base and
 * any trailing fragment. Disabled or keyless rows are omitted from the URL but
 * remain in the table. Values are kept raw to preserve variable tokens.
 */
export function applyParamsToUrl(url: string, params: KeyValue[]): string {
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const qIndex = withoutHash.indexOf('?');
  const base = qIndex === -1 ? withoutHash : withoutHash.slice(0, qIndex);

  const pairs = params
    .filter((p) => p.enabled && p.key.trim())
    .map((p) => `${p.key.trim()}=${p.value}`);

  return (pairs.length > 0 ? `${base}?${pairs.join('&')}` : base) + fragment;
}

/** Converts editor state into the HTTP payload carried by a {@link RequestEnvelope}. */
export function buildHttpPayload(draft: RequestDraft): HttpPayload {
  return {
    method: draft.method,
    url: draft.url,
    query: activePairs(draft.params),
    headers: activePairs(draft.headers),
    body: buildBody(draft),
  };
}

/** Whether the draft edits a plugin request type rather than plain HTTP. */
export function isPluginDraft(draft: RequestDraft): boolean {
  return Boolean(draft.requestType && draft.requestType !== HTTP_REQUEST_TYPE);
}

/** Converts editor state into the {@link RequestEnvelope} the engine runs. */
export function buildRequestEnvelope(
  draft: RequestDraft,
  id?: string,
  context?: VariableContext,
): RequestEnvelope {
  const hasContext = context && Object.keys(context).length > 0;
  const plugin = isPluginDraft(draft);
  return {
    ...(id ? { id } : {}),
    type: plugin ? (draft.requestType as string) : HTTP_REQUEST_TYPE,
    payload: plugin ? (draft.pluginPayload ?? {}) : buildHttpPayload(draft),
    ...(draft.auth.type !== 'none' ? { auth: draft.auth as AuthConfig } : {}),
    ...(hasContext ? { variableContext: context } : {}),
    options: draft.options,
  };
}
