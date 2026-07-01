import { describe, expect, it } from 'vitest';
import { formatJson, formatRawBody, formatXml } from './format-body';

describe('formatJson', () => {
  it('pretty-prints compact JSON with 2-space indent', () => {
    const r = formatJson('{"a":1,"b":[2,3]}');
    expect(r).toEqual({ ok: true, value: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}' });
  });

  it('leaves an empty/whitespace body unchanged', () => {
    expect(formatJson('   ')).toEqual({ ok: true, value: '   ' });
  });

  it('reports an error for invalid JSON', () => {
    const r = formatJson('{"a": {{n}}}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeTruthy();
  });

  it('keeps variables inside string values', () => {
    const r = formatJson('{"id":"{{userId}}"}');
    expect(r).toEqual({ ok: true, value: '{\n  "id": "{{userId}}"\n}' });
  });
});

describe('formatXml', () => {
  it('indents nested elements by depth', () => {
    const r = formatXml('<a><b>1</b><c/></a>');
    expect(r).toEqual({ ok: true, value: '<a>\n  <b>1</b>\n  <c/>\n</a>' });
  });

  it('does not indent under a self-closing tag', () => {
    const r = formatXml('<root><item id="1"/><item id="2"/></root>');
    expect(r).toEqual({
      ok: true,
      value: '<root>\n  <item id="1"/>\n  <item id="2"/>\n</root>',
    });
  });

  it('leaves the XML declaration at the top level', () => {
    const r = formatXml('<?xml version="1.0"?><a><b>x</b></a>');
    expect(r).toEqual({ ok: true, value: '<?xml version="1.0"?>\n<a>\n  <b>x</b>\n</a>' });
  });
});

describe('formatRawBody', () => {
  it('returns text bodies unchanged', () => {
    expect(formatRawBody('hello world', 'text')).toEqual({ ok: true, value: 'hello world' });
  });

  it('routes json and xml to their formatters', () => {
    expect(formatRawBody('{"a":1}', 'json')).toEqual({ ok: true, value: '{\n  "a": 1\n}' });
    expect(formatRawBody('<a><b/></a>', 'xml')).toEqual({ ok: true, value: '<a>\n  <b/>\n</a>' });
  });
});
