// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GraphqlProtocolExtras, httpViewOf, statusOf } from '@shared/protocol';
import type { HttpTransport, TransportRequest, TransportResponse } from '../transport';
import { ExecutionService } from '../execution-service';
import { createGraphqlProvider } from '../providers/graphql-provider';
import { RequestTypeRegistry } from '../../plugins/registries/request-type-registry';

class RecordingTransport implements HttpTransport {
  last?: TransportRequest;
  constructor(private readonly body = '{"data":{"user":{"id":"1"}}}') {}
  async send(req: TransportRequest): Promise<TransportResponse> {
    this.last = req;
    return {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(this.body),
    };
  }
}

class FailingTransport implements HttpTransport {
  async send(): Promise<TransportResponse> {
    throw new Error('ECONNREFUSED');
  }
}

const vars: Record<string, string> = { base: 'https://api.test', id: '42', token: 'secret' };
const evaluate = (tpl: string): string => tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');

function service(transport: HttpTransport): ExecutionService {
  return new ExecutionService(transport, {
    evaluate,
    requestTypes: new RequestTypeRegistry([createGraphqlProvider(transport)]),
  });
}

function envelope(payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type: 'graphql', payload, ...extra };
}

describe('createGraphqlProvider', () => {
  it('POSTs the operation as JSON and succeeds on data', async () => {
    const transport = new RecordingTransport();
    const response = await service(transport).run(
      envelope({ url: 'https://api.test/graphql', query: 'query { user { id } }' }),
    );
    expect(transport.last?.method).toBe('POST');
    expect(transport.last?.url).toBe('https://api.test/graphql');
    const sent = JSON.parse(transport.last?.body?.toString('utf8') ?? '{}');
    expect(sent).toEqual({ query: 'query { user { id } }' });
    expect(response.ok).toBe(true);
    expect(response.type).toBe('graphql');
    expect(statusOf(response)).toBe(200);
  });

  it('substitutes variables in url, query text, and operation variables', async () => {
    const transport = new RecordingTransport();
    await service(transport).run(
      envelope({
        url: '{{base}}/graphql',
        query: 'query($id: ID!) { user(id: $id) { id } }',
        variables: '{"id":"{{id}}"}',
        operationName: 'GetUser',
      }),
    );
    expect(transport.last?.url).toBe('https://api.test/graphql');
    const sent = JSON.parse(transport.last?.body?.toString('utf8') ?? '{}');
    expect(sent.variables).toEqual({ id: '42' });
    expect(sent.operationName).toBe('GetUser');
  });

  it('fails the operation on a 200 with top-level errors', async () => {
    const body = '{"data":null,"errors":[{"message":"boom","path":["user"]}]}';
    const transport = new RecordingTransport(body);
    const response = await service(transport).run(
      envelope({ url: 'https://api.test/graphql', query: '{ user { id } }' }),
    );
    expect(response.ok).toBe(false);
    expect(response.summary.tone).toBe('error');
    expect(response.summary.label).toBe('200 OK · 1 GraphQL error');
    const extras = GraphqlProtocolExtras.parse(response.protocol);
    expect(extras.graphqlErrors).toEqual([{ message: 'boom', path: ['user'] }]);
    // status assertions still see the transport status
    expect(statusOf(response)).toBe(200);
    expect(httpViewOf(response).headers['content-type']).toBe('application/json');
  });

  it('applies auth artifacts as request headers', async () => {
    const transport = new RecordingTransport();
    await service(transport).run(
      envelope(
        { url: 'https://api.test/graphql', query: '{ ping }' },
        { auth: { type: 'bearer', token: '{{token}}' } },
      ),
    );
    expect(transport.last?.headers['Authorization']).toBe('Bearer secret');
  });

  it('reports transport failures without GraphQL errors', async () => {
    const response = await service(new FailingTransport()).run(
      envelope({ url: 'https://api.test/graphql', query: '{ ping }' }),
    );
    expect(response.ok).toBe(false);
    expect(response.error).toContain('ECONNREFUSED');
    const extras = GraphqlProtocolExtras.parse(response.protocol);
    expect(extras.graphqlErrors).toEqual([]);
  });

  it('rejects invalid operation variables JSON before sending', async () => {
    const transport = new RecordingTransport();
    await expect(
      service(transport).run(
        envelope({ url: 'https://api.test/graphql', query: '{ ping }', variables: '{oops' }),
      ),
    ).rejects.toThrow(/variables are not valid JSON/);
    expect(transport.last).toBeUndefined();
  });
});
