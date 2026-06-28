// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExecutionRequest } from '@shared/execution';
import type { HttpTransport, TransportRequest, TransportResponse } from '../transport';
import { ExecutionService } from '../execution-service';

class RecordingTransport implements HttpTransport {
  last?: TransportRequest;
  async send(req: TransportRequest): Promise<TransportResponse> {
    this.last = req;
    return { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') };
  }
}

const vars: Record<string, string> = { base: 'https://api.test', token: 'secret' };
const evaluate = (tpl: string): string => tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');

function req(over: Partial<ExecutionRequest>): ExecutionRequest {
  return {
    method: 'GET',
    url: '{{base}}/users',
    headers: {},
    query: {},
    body: { type: 'none' },
    ...over,
  } as ExecutionRequest;
}

describe('ExecutionService', () => {
  it('substitutes variables in url, query, and headers', async () => {
    const transport = new RecordingTransport();
    const service = new ExecutionService(transport, { evaluate });
    await service.run(req({ headers: { 'X-Token': '{{token}}' }, query: { q: '1' } }));
    expect(transport.last?.url).toBe('https://api.test/users?q=1');
    expect(transport.last?.headers['X-Token']).toBe('secret');
  });

  it('applies inline auth with variable substitution', async () => {
    const transport = new RecordingTransport();
    const service = new ExecutionService(transport, { evaluate });
    await service.run(req({ auth: { type: 'bearer', token: '{{token}}' } }));
    expect(transport.last?.headers['Authorization']).toBe('Bearer secret');
  });

  it('builds a JSON body and sets content-type', async () => {
    const transport = new RecordingTransport();
    const service = new ExecutionService(transport, { evaluate });
    await service.run(req({ method: 'POST', body: { type: 'json', content: '{"id":"{{token}}"}' } }));
    expect(transport.last?.body?.toString('utf8')).toBe('{"id":"secret"}');
    const ct = Object.entries(transport.last?.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type');
    expect(ct?.[1]).toBe('application/json');
  });

  it('merges api-key query auth into the url', async () => {
    const transport = new RecordingTransport();
    const service = new ExecutionService(transport, { evaluate });
    await service.run(req({ auth: { type: 'apiKey', key: 'api_key', value: '{{token}}', in: 'query' } }));
    expect(transport.last?.url).toContain('api_key=secret');
  });
});
