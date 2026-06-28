// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeSpec } from '../normalizer';

describe('normalizeSpec — request details', () => {
  it('extracts headers, query params, and a JSON body example (OpenAPI 3)', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      servers: [{ url: 'https://api.test' }],
      paths: {
        '/pets': {
          post: {
            tags: ['pets'],
            summary: 'Create pet',
            parameters: [
              { name: 'X-Trace', in: 'header', schema: { type: 'string' } },
              { name: 'dryRun', in: 'query', schema: { type: 'boolean' } },
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Pet' },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Pet: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'integer' } } },
        },
      },
    };

    const spec = normalizeSpec(doc, 'openapi-3');
    const op = spec.operations[0];
    expect(op.details).toBeDefined();
    expect(op.details?.headers).toEqual([{ key: 'X-Trace', value: 'string', enabled: true }]);
    expect(op.details?.params).toEqual([{ key: 'dryRun', value: 'true', enabled: true }]);
    expect(op.details?.body.mode).toBe('raw');
    expect(JSON.parse(op.details?.body.rawBody ?? '{}')).toEqual({ name: 'string', age: 0 });
  });

  it('extracts a body example from a Swagger 2 body parameter', () => {
    const doc = {
      swagger: '2.0',
      info: { title: 'API', version: '1.0' },
      host: 'api.test',
      basePath: '/v1',
      paths: {
        '/users': {
          post: {
            summary: 'Create user',
            parameters: [
              {
                name: 'body',
                in: 'body',
                schema: { type: 'object', properties: { email: { type: 'string', format: 'email' } } },
              },
            ],
          },
        },
      },
    };

    const spec = normalizeSpec(doc, 'swagger-2');
    const op = spec.operations[0];
    expect(op.details?.body.mode).toBe('raw');
    expect(JSON.parse(op.details?.body.rawBody ?? '{}')).toEqual({ email: 'user@example.com' });
  });

  it('leaves details undefined for a parameterless GET', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0' },
      paths: { '/ping': { get: { summary: 'Ping' } } },
    };
    const spec = normalizeSpec(doc, 'openapi-3');
    expect(spec.operations[0].details).toBeUndefined();
  });
});
