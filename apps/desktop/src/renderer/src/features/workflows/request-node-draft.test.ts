import { describe, expect, it } from 'vitest';
import {
  GRAPHQL_REQUEST_TYPE,
  GRPC_REQUEST_TYPE,
  GrpcPayload,
  SSE_REQUEST_TYPE,
  WEBSOCKET_REQUEST_TYPE,
} from '@shared/protocol';
import type { RequestNodeConfig } from '@shared/workflow';
import { draftToNodeConfig, nodeConfigToDraft } from './request-node-draft';

function config(over: Partial<RequestNodeConfig>): RequestNodeConfig {
  return { type: 'http', payload: {}, extract: [], ...over } as RequestNodeConfig;
}

describe('request-node-draft round-trips', () => {
  it('preserves an HTTP request node through draft and back', () => {
    const original = config({
      type: 'http',
      payload: { method: 'POST', url: 'https://api.test/x', headers: { A: '1' }, query: {}, body: { type: 'none' } },
    });
    const out = draftToNodeConfig(nodeConfigToDraft(original), []);
    expect(out.type).toBe('http');
    expect(out.payload).toMatchObject({ method: 'POST', url: 'https://api.test/x' });
  });

  it('keeps a GraphQL node non-HTTP (regression: type was hard-coded to http)', () => {
    const original = config({
      type: GRAPHQL_REQUEST_TYPE,
      payload: { url: 'https://api.test/graphql', query: '{ me { id } }' },
    });
    const draft = nodeConfigToDraft(original);
    expect(draft.requestType).toBe(GRAPHQL_REQUEST_TYPE);
    const out = draftToNodeConfig(draft, []);
    expect(out.type).toBe(GRAPHQL_REQUEST_TYPE);
    expect(out.payload).toMatchObject({ query: '{ me { id } }' });
  });

  it('seeds gRPC defaults so the payload validates even when unset', () => {
    const draft = nodeConfigToDraft(config({ type: GRPC_REQUEST_TYPE, payload: {} }));
    const out = draftToNodeConfig(draft, []);
    expect(out.type).toBe(GRPC_REQUEST_TYPE);
    expect(() => GrpcPayload.parse(out.payload)).not.toThrow();
  });

  it('round-trips WebSocket and SSE nodes preserving type and payload', () => {
    for (const type of [WEBSOCKET_REQUEST_TYPE, SSE_REQUEST_TYPE]) {
      const original = config({ type, payload: { url: 'wss://echo.test' } });
      const out = draftToNodeConfig(nodeConfigToDraft(original), []);
      expect(out.type).toBe(type);
      expect(out.payload).toMatchObject({ url: 'wss://echo.test' });
    }
  });

  it('preserves extract rules and requestId', () => {
    const draft = nodeConfigToDraft(config({ type: GRAPHQL_REQUEST_TYPE, payload: { url: 'x' } }));
    const rules = [{ variable: 'id', source: 'body' as const, engine: 'jsonpath' as const, expression: '$.id' }];
    const out = draftToNodeConfig(draft, rules, 'req-1');
    expect(out.extract).toEqual(rules);
    expect(out.requestId).toBe('req-1');
  });
});
