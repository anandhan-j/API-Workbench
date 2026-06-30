import { describe, expect, it } from 'vitest';
import type { RequestDetailFull } from '@shared/request-details';
import {
  applyParamsToUrl,
  buildExecutionRequest,
  defaultDraft,
  detailToDraft,
  draftToDetails,
  newRow,
  parseQueryParams,
  type KeyValue,
  type RequestDraft,
} from './build-request';

function kv(key: string, value: string, enabled = true): KeyValue {
  return { id: crypto.randomUUID(), key, value, enabled };
}

function draftWith(over: Partial<RequestDraft>): RequestDraft {
  return { ...defaultDraft('POST', 'https://api.test/x'), ...over };
}

describe('buildExecutionRequest', () => {
  it('collects enabled params and headers, ignoring blank/disabled rows', () => {
    const req = buildExecutionRequest(
      draftWith({
        params: [
          { id: '1', key: 'q', value: '1', enabled: true },
          { id: '2', key: 'skip', value: 'x', enabled: false },
          { id: '3', key: '', value: 'noKey', enabled: true },
        ],
        headers: [{ id: 'h', key: 'X-Test', value: 'yes', enabled: true }, newRow()],
      }),
    );
    expect(req.query).toEqual({ q: '1' });
    expect(req.headers).toEqual({ 'X-Test': 'yes' });
  });

  it('builds a JSON raw body', () => {
    const req = buildExecutionRequest(draftWith({ bodyMode: 'raw', rawType: 'json', rawBody: '{"a":1}' }));
    expect(req.body).toEqual({ type: 'json', content: '{"a":1}' });
  });

  it('builds text/xml raw bodies with content types', () => {
    expect(buildExecutionRequest(draftWith({ bodyMode: 'raw', rawType: 'xml', rawBody: '<x/>' })).body).toEqual({
      type: 'text',
      content: '<x/>',
      contentType: 'application/xml',
    });
  });

  it('builds urlencoded and multipart form bodies', () => {
    const fields = [
      { id: '1', key: 'a', value: '1', enabled: true },
      { id: '2', key: 'b', value: '2', enabled: false },
    ];
    expect(buildExecutionRequest(draftWith({ bodyMode: 'urlencoded', formFields: fields })).body).toEqual({
      type: 'form',
      fields: [{ name: 'a', value: '1' }],
    });
    expect(buildExecutionRequest(draftWith({ bodyMode: 'formdata', formFields: fields })).body).toEqual({
      type: 'multipart',
      fields: [{ name: 'a', value: '1' }],
    });
  });

  it('omits auth when type is none and includes it otherwise', () => {
    expect(buildExecutionRequest(draftWith({})).auth).toBeUndefined();
    const withAuth = buildExecutionRequest(draftWith({ auth: { type: 'bearer', token: 't' } }));
    expect(withAuth.auth).toEqual({ type: 'bearer', token: 't' });
  });

  it('passes execution options and an optional id', () => {
    const req = buildExecutionRequest(draftWith({ options: { timeoutMs: 5000, maxRetries: 2, followRedirects: false } }), 'exec-1');
    expect(req.id).toBe('exec-1');
    expect(req.options).toEqual({ timeoutMs: 5000, maxRetries: 2, followRedirects: false });
  });
});

const detail: RequestDetailFull = {
  id: 'r1',
  collectionId: 'c1',
  folderId: null,
  name: 'Create pet',
  method: 'POST',
  url: 'https://api.test/pets',
  favorite: false,
  details: {
    headers: [{ key: 'X-Trace', value: 'abc', enabled: true }],
    params: [{ key: 'dryRun', value: 'true', enabled: false }],
    auth: { type: 'none' },
    body: { mode: 'raw', rawType: 'json', rawBody: '{"name":"Rex"}', formFields: [], binaryBase64: '', binaryFileName: '' },
    options: { timeoutMs: 30_000, maxRetries: 0, followRedirects: true },
    preRequestScript: '',
    postResponseScript: '',
  },
};

describe('form-data file fields', () => {
  it('maps a file row to a multipart file part', () => {
    const body = buildExecutionRequest(
      draftWith({
        bodyMode: 'formdata',
        formFields: [
          { id: '1', key: 'title', value: 'hi', enabled: true },
          { id: '2', key: 'avatar', value: '12 KB', enabled: true, kind: 'file', fileName: 'a.png', fileBase64: 'AAA=' },
        ],
      }),
    ).body;
    expect(body).toEqual({
      type: 'multipart',
      fields: [
        { name: 'title', value: 'hi' },
        { name: 'avatar', fileName: 'a.png', base64: 'AAA=' },
      ],
    });
  });

  it('round-trips a file form field and binary file name through details', () => {
    const d: RequestDetailFull = {
      ...detail,
      details: {
        ...detail.details,
        body: {
          mode: 'formdata',
          rawType: 'json',
          rawBody: '',
          formFields: [{ key: 'avatar', value: '12 KB', enabled: true, kind: 'file', fileName: 'a.png', fileBase64: 'AAA=' }],
          binaryBase64: '',
          binaryFileName: '',
        },
      },
    };
    const out = draftToDetails(detailToDraft(d));
    expect(out.body.formFields).toEqual([
      { key: 'avatar', value: '12 KB', enabled: true, kind: 'file', fileName: 'a.png', fileBase64: 'AAA=' },
    ]);
  });
});

describe('parseQueryParams / applyParamsToUrl', () => {
  it('parses a query string into enabled rows', () => {
    const rows = parseQueryParams('https://api.test/pets?status=available&limit=10');
    expect(rows.map((r) => ({ key: r.key, value: r.value, enabled: r.enabled }))).toEqual([
      { key: 'status', value: 'available', enabled: true },
      { key: 'limit', value: '10', enabled: true },
    ]);
  });

  it('returns no rows when there is no query string', () => {
    expect(parseQueryParams('https://api.test/pets')).toEqual([]);
    expect(parseQueryParams('https://api.test/pets?')).toEqual([]);
  });

  it('writes enabled rows into the URL, preserving the base and dropping disabled/blank', () => {
    const url = applyParamsToUrl('https://api.test/pets?old=1', [
      kv('status', 'available'),
      kv('limit', '10', false),
      kv('', 'ignored'),
    ]);
    expect(url).toBe('https://api.test/pets?status=available');
  });

  it('clears the query string when no enabled rows remain', () => {
    expect(applyParamsToUrl('https://api.test/pets?a=1', [kv('a', '1', false)])).toBe(
      'https://api.test/pets',
    );
  });

  it('preserves variable tokens and a trailing fragment', () => {
    expect(applyParamsToUrl('{{base}}/pets#frag', [kv('id', '{{petId}}')])).toBe(
      '{{base}}/pets?id={{petId}}#frag',
    );
  });

  it('round-trips url -> params -> url', () => {
    const url = 'https://api.test/pets?status=available&limit=10';
    expect(applyParamsToUrl(url, parseQueryParams(url))).toBe(url);
  });
});

describe('detailToDraft / draftToDetails', () => {
  it('loads a persisted definition into editor rows with a trailing blank', () => {
    const draft = detailToDraft(detail);
    expect(draft.method).toBe('POST');
    expect(draft.url).toBe('https://api.test/pets');
    expect(draft.headers[0]).toMatchObject({ key: 'X-Trace', value: 'abc', enabled: true });
    expect(draft.params[0]).toMatchObject({ key: 'dryRun', value: 'true', enabled: false });
    expect(draft.headers[draft.headers.length - 1].key).toBe('');
    expect(draft.bodyMode).toBe('raw');
    expect(draft.rawBody).toBe('{"name":"Rex"}');
  });

  it('round-trips definition -> draft -> definition, dropping blank rows', () => {
    const out = draftToDetails(detailToDraft(detail));
    expect(out.headers).toEqual(detail.details.headers);
    expect(out.params).toEqual(detail.details.params);
    expect(out.body).toEqual(detail.details.body);
    expect(out.options).toEqual(detail.details.options);
  });
});
