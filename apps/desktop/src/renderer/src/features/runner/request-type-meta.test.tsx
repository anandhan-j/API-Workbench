import { describe, expect, it } from 'vitest';
import {
  GRAPHQL_REQUEST_TYPE,
  GRPC_REQUEST_TYPE,
  GraphqlPayload,
  GrpcPayload,
  SSE_REQUEST_TYPE,
  SsePayload,
  WEBSOCKET_REQUEST_TYPE,
  WebSocketPayload,
} from '@shared/protocol';
import type { PluginContributionIndex } from '@shared/plugins';
import { defaultDraft, type RequestDraft } from './build-request';
import {
  BUILTIN_PROTOCOL_TYPES,
  getRequestTypeMeta,
  isBuiltinProtocol,
  persistedIdentity,
} from './request-type-meta';

const SCHEMAS = {
  [GRAPHQL_REQUEST_TYPE]: GraphqlPayload,
  [GRPC_REQUEST_TYPE]: GrpcPayload,
  [WEBSOCKET_REQUEST_TYPE]: WebSocketPayload,
  [SSE_REQUEST_TYPE]: SsePayload,
} as const;

describe('isBuiltinProtocol', () => {
  it('recognizes the four built-in protocols and rejects http/plugin/undefined', () => {
    for (const t of BUILTIN_PROTOCOL_TYPES) expect(isBuiltinProtocol(t)).toBe(true);
    expect(isBuiltinProtocol('http')).toBe(false);
    expect(isBuiltinProtocol('plugin:x/echo')).toBe(false);
    expect(isBuiltinProtocol(undefined)).toBe(false);
  });
});

describe('getRequestTypeMeta', () => {
  it('returns meta for built-ins and undefined otherwise', () => {
    expect(getRequestTypeMeta(GRAPHQL_REQUEST_TYPE)?.badge).toBe('GQL');
    expect(getRequestTypeMeta(GRPC_REQUEST_TYPE)?.badge).toBe('gRPC');
    expect(getRequestTypeMeta(WEBSOCKET_REQUEST_TYPE)?.badge).toBe('WS');
    expect(getRequestTypeMeta(SSE_REQUEST_TYPE)?.badge).toBe('SSE');
    expect(getRequestTypeMeta('http')).toBeUndefined();
    expect(getRequestTypeMeta('plugin:x/echo')).toBeUndefined();
  });

  it('produces a schema-valid default payload for every built-in', () => {
    for (const type of BUILTIN_PROTOCOL_TYPES) {
      const payload = getRequestTypeMeta(type)!.defaultPayload();
      expect(() => SCHEMAS[type as keyof typeof SCHEMAS].parse(payload)).not.toThrow();
    }
  });

  it('derives the display target from the payload', () => {
    expect(getRequestTypeMeta(GRAPHQL_REQUEST_TYPE)!.targetOf({ url: 'https://x/graphql' })).toBe(
      'https://x/graphql',
    );
    expect(
      getRequestTypeMeta(GRPC_REQUEST_TYPE)!.targetOf({
        target: 'localhost:50051',
        service: 'greeter.Greeter',
        method: 'SayHello',
      }),
    ).toBe('localhost:50051/greeter.Greeter.SayHello');
    expect(getRequestTypeMeta(WEBSOCKET_REQUEST_TYPE)!.targetOf({ url: 'wss://x' })).toBe('wss://x');
  });
});

describe('persistedIdentity', () => {
  const pluginTypes: PluginContributionIndex['requestTypes'] = [
    {
      pluginId: 'demo',
      pluginName: 'Demo',
      type: 'echo',
      label: 'Echo',
      payloadSchema: { fields: [] },
      summary: { badge: 'ECHO', targetKey: 'target' },
    },
  ];

  function draft(over: Partial<RequestDraft>): RequestDraft {
    return { ...defaultDraft('GET', 'http://x'), ...over };
  }

  it('uses the real method/url for HTTP', () => {
    expect(persistedIdentity(draft({ method: 'POST', url: 'http://x/y' }), [])).toEqual({
      type: 'http',
      method: 'POST',
      url: 'http://x/y',
    });
  });

  it('stores the badge/target for a built-in protocol', () => {
    const d = draft({
      requestType: GRPC_REQUEST_TYPE,
      pluginPayload: { target: 'h:1', service: 'S', method: 'M' },
    });
    expect(persistedIdentity(d, [])).toEqual({ type: GRPC_REQUEST_TYPE, method: 'gRPC', url: 'h:1/S.M' });
  });

  it('stores a plugin type badge and its target key value', () => {
    const d = draft({ requestType: 'plugin:demo/echo', pluginPayload: { target: 'loopback' } });
    expect(persistedIdentity(d, pluginTypes)).toEqual({
      type: 'plugin:demo/echo',
      method: 'ECHO',
      url: 'loopback',
    });
  });

  it('falls back for an unknown (disabled) plugin type', () => {
    const d = draft({ requestType: 'plugin:gone/x', pluginPayload: {} });
    expect(persistedIdentity(d, pluginTypes)).toEqual({ type: 'plugin:gone/x', method: 'PLUGIN', url: '' });
  });
});
