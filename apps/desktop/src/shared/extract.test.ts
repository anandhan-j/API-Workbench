// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExecutionResponse } from './execution';
import { toProtocolResponse, type ProtocolResponse } from './protocol';
import type { ExtractRule } from './workflow';
import { applyEngine, applyTransform, extractFromResponse, stringify } from './extract';

function response(body: string, extra: Partial<ExecutionResponse> = {}): ProtocolResponse {
  return toProtocolResponse({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json', 'x-token': 'abc123' },
    body,
    bodyKind: 'json',
    contentType: 'application/json',
    sizeBytes: body.length,
    timings: { startedAt: 0, totalMs: 1 },
    redirects: [],
    retries: 0,
    ...extra,
  });
}

const JSON_BODY = '{"data":{"id":5,"items":[{"id":7},{"id":8}]},"name":"ok"}';

describe('extract engines', () => {
  it('reads values with JSONPath', () => {
    expect(applyEngine('jsonpath', JSON_BODY, '$.data.id')).toBe('5');
    expect(applyEngine('jsonpath', JSON_BODY, '$.data.items[1].id')).toBe('8');
  });

  it('reads values with JMESPath', () => {
    expect(applyEngine('jmespath', JSON_BODY, 'data.id')).toBe('5');
    expect(applyEngine('jmespath', JSON_BODY, 'data.items[0].id')).toBe('7');
  });

  it('reads values with regex (first capture group, else full match)', () => {
    expect(applyEngine('regex', 'order=42;', 'order=(\\d+)')).toBe('42');
    expect(applyEngine('regex', 'abc-xyz', '[a-z]+')).toBe('abc');
  });

  it('stringifies objects and returns empty for misses / bad input', () => {
    expect(applyEngine('jsonpath', JSON_BODY, '$.data')).toContain('"id":5');
    expect(applyEngine('jsonpath', JSON_BODY, '$.nope')).toBe('');
    expect(applyEngine('jsonpath', 'not json', '$.x')).toBe('');
    expect(applyEngine('jmespath', JSON_BODY, '')).toBe('');
  });

  it('stringify handles primitives, objects, null', () => {
    expect(stringify(5)).toBe('5');
    expect(stringify(null)).toBe('');
    expect(stringify({ a: 1 })).toBe('{"a":1}');
  });
});

describe('extractFromResponse', () => {
  it('reads body / header / status sources', () => {
    const res = response(JSON_BODY);
    const body: ExtractRule = { variable: 'id', source: 'body', engine: 'jsonpath', expression: '$.data.id' };
    const header: ExtractRule = { variable: 'tok', source: 'header', engine: 'jsonpath', expression: 'X-Token' };
    const status: ExtractRule = { variable: 'st', source: 'status', engine: 'jsonpath', expression: '' };
    expect(extractFromResponse(res, body)).toBe('5');
    expect(extractFromResponse(res, header)).toBe('abc123'); // case-insensitive header
    expect(extractFromResponse(res, status)).toBe('200');
  });
});

describe('applyTransform', () => {
  it('evaluates a template with the provided resolver', () => {
    const value = applyTransform(
      { variable: 'v', engine: 'template', input: '', expression: '{{a}}-{{b}}' },
      (t) => t.replace('{{a}}', '1').replace('{{b}}', '2'),
    );
    expect(value).toBe('1-2');
  });

  it('resolves the input then applies the path engine', () => {
    const value = applyTransform(
      { variable: 'v', engine: 'jsonpath', input: '{{payload}}', expression: '$.n' },
      () => '{"n":9}',
    );
    expect(value).toBe('9');
  });
});
