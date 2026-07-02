// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FormSchema, compileFormSchemaToZod, formDefaults } from './forms';

/** Parses a raw schema through the FormSchema Zod (applies field defaults). */
function schema(fields: unknown[]): FormSchema {
  return FormSchema.parse({ fields });
}

describe('FormSchema', () => {
  it('rejects duplicate field keys', () => {
    const result = FormSchema.safeParse({
      fields: [
        { key: 'a', label: 'A', kind: 'string' },
        { key: 'a', label: 'A again', kind: 'number' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/unique/i);
    }
  });

  it('rejects invalid field keys', () => {
    expect(FormSchema.safeParse({ fields: [{ key: '1bad', label: 'X', kind: 'string' }] }).success).toBe(
      false,
    );
    expect(FormSchema.safeParse({ fields: [{ key: 'has space', label: 'X', kind: 'string' }] }).success).toBe(
      false,
    );
  });

  it('applies field-level defaults (required=false, substituteVariables=true)', () => {
    const parsed = schema([{ key: 'a', label: 'A', kind: 'string' }]);
    expect(parsed.fields[0]).toMatchObject({ required: false, substituteVariables: true });
  });
});

describe('compileFormSchemaToZod', () => {
  it('string: optional gets empty-string default, required must be non-empty', () => {
    const zod = compileFormSchemaToZod(
      schema([
        { key: 'opt', label: 'Opt', kind: 'string' },
        { key: 'req', label: 'Req', kind: 'string', required: true },
      ]),
    );
    expect(zod.parse({ req: 'x' })).toEqual({ opt: '', req: 'x' });
    expect(() => zod.parse({})).toThrow(); // required missing
    expect(() => zod.parse({ req: '' })).toThrow(); // required empty
  });

  it('string: declared default wins over the natural empty string', () => {
    const zod = compileFormSchemaToZod(
      schema([{ key: 's', label: 'S', kind: 'string', default: 'hello' }]),
    );
    expect(zod.parse({})).toEqual({ s: 'hello' });
  });

  it('string: pattern is enforced', () => {
    const zod = compileFormSchemaToZod(
      schema([{ key: 's', label: 'S', kind: 'string', required: true, pattern: '^[a-z]+$' }]),
    );
    expect(zod.parse({ s: 'abc' })).toEqual({ s: 'abc' });
    expect(() => zod.parse({ s: 'ABC' })).toThrow();
  });

  it('string: an invalid author-supplied pattern is tolerated', () => {
    const zod = compileFormSchemaToZod(
      schema([{ key: 's', label: 'S', kind: 'string', required: true, pattern: '[unclosed' }]),
    );
    // The broken regex must not make the form unusable; plain string validation remains.
    expect(zod.parse({ s: 'anything' })).toEqual({ s: 'anything' });
    expect(() => zod.parse({ s: 42 })).toThrow();
  });

  it('textarea and secret behave as strings', () => {
    const zod = compileFormSchemaToZod(
      schema([
        { key: 't', label: 'T', kind: 'textarea' },
        { key: 'sec', label: 'S', kind: 'secret', required: true },
      ]),
    );
    expect(zod.parse({ sec: 'pw' })).toEqual({ t: '', sec: 'pw' });
    expect(() => zod.parse({ sec: '' })).toThrow();
  });

  it('number: min/max/integer are enforced; no natural default', () => {
    const zod = compileFormSchemaToZod(
      schema([{ key: 'n', label: 'N', kind: 'number', min: 1, max: 10, integer: true }]),
    );
    expect(zod.parse({ n: 5 })).toEqual({ n: 5 });
    expect(zod.parse({})).toEqual({}); // optional, no default
    expect(() => zod.parse({ n: 0 })).toThrow();
    expect(() => zod.parse({ n: 11 })).toThrow();
    expect(() => zod.parse({ n: 1.5 })).toThrow();
  });

  it('number: declared default is applied when absent', () => {
    const zod = compileFormSchemaToZod(
      schema([{ key: 'n', label: 'N', kind: 'number', default: 7 }]),
    );
    expect(zod.parse({})).toEqual({ n: 7 });
  });

  it('boolean: defaults to false when optional', () => {
    const zod = compileFormSchemaToZod(schema([{ key: 'b', label: 'B', kind: 'boolean' }]));
    expect(zod.parse({})).toEqual({ b: false });
    expect(zod.parse({ b: true })).toEqual({ b: true });
    expect(() => zod.parse({ b: 'yes' })).toThrow();
  });

  it('select: only declared option values pass; first option is the natural default', () => {
    const options = [
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'Blue' },
    ];
    const zod = compileFormSchemaToZod(schema([{ key: 'c', label: 'C', kind: 'select', options }]));
    expect(zod.parse({})).toEqual({ c: 'red' });
    expect(zod.parse({ c: 'blue' })).toEqual({ c: 'blue' });
    expect(() => zod.parse({ c: 'green' })).toThrow();
  });

  it('select: declared default beats the first option', () => {
    const options = [
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'Blue' },
    ];
    const zod = compileFormSchemaToZod(
      schema([{ key: 'c', label: 'C', kind: 'select', options, default: 'blue' }]),
    );
    expect(zod.parse({})).toEqual({ c: 'blue' });
  });

  it('keyvalue: validates a string→string record, defaulting to {}', () => {
    const zod = compileFormSchemaToZod(schema([{ key: 'kv', label: 'KV', kind: 'keyvalue' }]));
    expect(zod.parse({})).toEqual({ kv: {} });
    expect(zod.parse({ kv: { a: '1' } })).toEqual({ kv: { a: '1' } });
    expect(() => zod.parse({ kv: { a: 1 } })).toThrow();
    expect(() => zod.parse({ kv: 'nope' })).toThrow();
  });

  it('required keyvalue must be present', () => {
    const zod = compileFormSchemaToZod(
      schema([{ key: 'kv', label: 'KV', kind: 'keyvalue', required: true }]),
    );
    expect(() => zod.parse({})).toThrow();
    expect(zod.parse({ kv: {} })).toEqual({ kv: {} });
  });
});

describe('formDefaults', () => {
  it('produces the fully-defaulted seed values for every kind', () => {
    const values = formDefaults(
      schema([
        { key: 's', label: 'S', kind: 'string' },
        { key: 'sd', label: 'SD', kind: 'string', default: 'x' },
        { key: 't', label: 'T', kind: 'textarea' },
        { key: 'sec', label: 'Sec', kind: 'secret' },
        { key: 'n', label: 'N', kind: 'number' },
        { key: 'nd', label: 'ND', kind: 'number', default: 3 },
        { key: 'b', label: 'B', kind: 'boolean' },
        { key: 'bd', label: 'BD', kind: 'boolean', default: true },
        {
          key: 'c',
          label: 'C',
          kind: 'select',
          options: [{ value: 'one', label: 'One' }],
        },
        { key: 'kv', label: 'KV', kind: 'keyvalue' },
      ]),
    );
    expect(values).toEqual({
      s: '',
      sd: 'x',
      t: '',
      sec: '',
      // n omitted: numbers have no natural default
      nd: 3,
      b: false,
      bd: true,
      c: 'one',
      kv: {},
    });
    expect('n' in values).toBe(false);
  });

  it('the defaults pass the compiled validator', () => {
    const s = schema([
      { key: 's', label: 'S', kind: 'string' },
      { key: 'b', label: 'B', kind: 'boolean' },
      { key: 'c', label: 'C', kind: 'select', options: [{ value: 'v', label: 'V' }] },
      { key: 'kv', label: 'KV', kind: 'keyvalue' },
    ]);
    expect(() => compileFormSchemaToZod(s).parse(formDefaults(s))).not.toThrow();
  });
});
