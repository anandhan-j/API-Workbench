import type { RequestBody } from '@shared/execution';
import type { HttpMethod } from '@shared/collection';
import { HTTP_REQUEST_TYPE, type HttpPayload } from '@shared/protocol';
import type { ExtractRule, RequestNodeConfig } from '@shared/workflow';
import {
  buildRequestEnvelope,
  defaultDraft,
  newRow,
  type KeyValue,
  type RawType,
  type RequestDraft,
} from '../runner/build-request';

/**
 * Bridges a workflow request node's config and the runner's {@link RequestDraft},
 * so the full request editor (the "run window") can configure a workflow request
 * node. `nodeConfigToDraft` seeds the editor; `draftToNodeConfig` applies the
 * edited draft back, reusing the runner's exact draft → request conversion and
 * preserving the node's `extract` rules and collection `requestId`.
 */

function recordToRows(record: Record<string, string>): KeyValue[] {
  const rows: KeyValue[] = Object.entries(record).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true,
  }));
  rows.push(newRow());
  return rows;
}

type BodyDraft = Pick<
  RequestDraft,
  'bodyMode' | 'rawType' | 'rawBody' | 'formFields' | 'binaryBase64' | 'binaryFileName'
>;

function bodyToDraft(body: RequestBody): BodyDraft {
  const base: BodyDraft = {
    bodyMode: 'none',
    rawType: 'json',
    rawBody: '',
    formFields: [newRow()],
    binaryBase64: '',
    binaryFileName: '',
  };
  switch (body.type) {
    case 'json':
      return { ...base, bodyMode: 'raw', rawType: 'json', rawBody: body.content };
    case 'text': {
      const rawType: RawType = body.contentType?.includes('xml') ? 'xml' : 'text';
      return { ...base, bodyMode: 'raw', rawType, rawBody: body.content };
    }
    case 'form':
      return {
        ...base,
        bodyMode: 'urlencoded',
        formFields: [
          ...body.fields.map((f) => ({ id: crypto.randomUUID(), key: f.name, value: f.value, enabled: true })),
          newRow(),
        ],
      };
    case 'multipart':
      return {
        ...base,
        bodyMode: 'formdata',
        formFields: [
          ...body.fields.map((f) =>
            f.fileName !== undefined || f.base64 !== undefined
              ? {
                  id: crypto.randomUUID(),
                  key: f.name,
                  value: '',
                  enabled: true,
                  kind: 'file' as const,
                  fileName: f.fileName ?? '',
                  fileBase64: f.base64 ?? '',
                }
              : { id: crypto.randomUUID(), key: f.name, value: f.value ?? '', enabled: true },
          ),
          newRow(),
        ],
      };
    case 'binary':
      return { ...base, bodyMode: 'binary', binaryBase64: body.base64 };
    default:
      return base;
  }
}

export function nodeConfigToDraft(config: RequestNodeConfig): RequestDraft {
  const payload = (config.payload ?? {}) as Partial<HttpPayload>;
  const method = (payload.method ?? 'GET') as HttpMethod;
  const url = payload.url ?? '';
  const base = defaultDraft(method, url);
  return {
    ...base,
    method,
    url,
    headers: recordToRows(payload.headers ?? {}),
    params: recordToRows(payload.query ?? {}),
    auth: config.auth ?? { type: 'none' },
    ...bodyToDraft(payload.body ?? { type: 'none' }),
    options: {
      timeoutMs: config.options?.timeoutMs ?? 30_000,
      maxRetries: config.options?.maxRetries ?? 0,
      followRedirects: config.options?.followRedirects ?? true,
    },
  };
}

export function draftToNodeConfig(
  draft: RequestDraft,
  extract: ExtractRule[],
  requestId?: string,
): RequestNodeConfig {
  const envelope = buildRequestEnvelope(draft);
  return {
    type: HTTP_REQUEST_TYPE,
    payload: envelope.payload,
    ...(envelope.auth ? { auth: envelope.auth } : {}),
    ...(envelope.options ? { options: envelope.options } : {}),
    extract,
    ...(requestId ? { requestId } : {}),
  };
}
