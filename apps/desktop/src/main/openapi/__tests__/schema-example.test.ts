// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeRefResolver, schemaToExample, scalarString } from '../schema-example';

describe('schemaToExample', () => {
  const doc = {
    components: {
      schemas: {
        Pet: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            owner: { $ref: '#/components/schemas/Owner' },
          },
        },
        Owner: {
          type: 'object',
          properties: { email: { type: 'string', format: 'email' } },
        },
        Node: {
          type: 'object',
          properties: { next: { $ref: '#/components/schemas/Node' } },
        },
      },
    },
  };
  const resolve = makeRefResolver(doc);

  it('builds a nested example resolving $ref', () => {
    const example = schemaToExample({ $ref: '#/components/schemas/Pet' }, resolve);
    expect(example).toEqual({
      id: 0,
      name: 'string',
      tags: ['string'],
      owner: { email: 'user@example.com' },
    });
  });

  it('prefers an explicit example, then default, then enum', () => {
    expect(schemaToExample({ type: 'string', example: 'hi' }, resolve)).toBe('hi');
    expect(schemaToExample({ type: 'string', default: 'def' }, resolve)).toBe('def');
    expect(schemaToExample({ type: 'string', enum: ['a', 'b'] }, resolve)).toBe('a');
  });

  it('terminates on cyclic $ref', () => {
    const example = schemaToExample({ $ref: '#/components/schemas/Node' }, resolve) as {
      next: unknown;
    };
    expect(example.next).toBeNull();
  });

  it('coerces scalars for header/param values', () => {
    expect(scalarString(5)).toBe('5');
    expect(scalarString(true)).toBe('true');
    expect(scalarString({ a: 1 })).toBe('{"a":1}');
    expect(scalarString(null)).toBe('');
  });
});
