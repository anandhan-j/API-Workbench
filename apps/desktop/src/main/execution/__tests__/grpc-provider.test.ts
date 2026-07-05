// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { GrpcProtocolExtras, statusOf } from '@shared/protocol';
import { ExecutionService } from '../execution-service';
import { createGrpcProvider } from '../providers/grpc-provider';
import type { GrpcInvoker, GrpcUnaryRequest, GrpcUnaryResult } from '../grpc/grpc-client';
import { RequestTypeRegistry } from '../../plugins/registries/request-type-registry';
import { FetchTransport } from '../node-transport';

const vars: Record<string, string> = { host: 'localhost:50051', who: 'ada', token: 'secret' };
const evaluate = (tpl: string): string => tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');

function fakeInvoker(
  impl: (req: GrpcUnaryRequest) => Promise<GrpcUnaryResult> | GrpcUnaryResult,
): GrpcInvoker & { calls: GrpcUnaryRequest[] } {
  const calls: GrpcUnaryRequest[] = [];
  return {
    calls,
    async invokeUnary(req) {
      calls.push(req);
      return impl(req);
    },
  };
}

function service(invoker: GrpcInvoker): ExecutionService {
  // FetchTransport is unused (no HTTP request is made) but satisfies the ctor.
  return new ExecutionService(new FetchTransport(() => true), {
    evaluate,
    requestTypes: new RequestTypeRegistry([createGrpcProvider(invoker)]),
  });
}

function envelope(payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    type: 'grpc',
    payload: { service: 'greeter.Greeter', method: 'SayHello', protoFile: '/x.proto', ...payload },
    ...extra,
  };
}

describe('createGrpcProvider', () => {
  it('encodes a JSON message, substitutes variables, and returns OK', async () => {
    const invoker = fakeInvoker(() => ({
      message: { message: 'hi ada' },
      statusCode: 0,
      statusName: 'OK',
      metadata: { 'content-type': 'application/grpc' },
      trailers: {},
    }));
    const response = await service(invoker).run(
      envelope({ target: '{{host}}', message: '{"name":"{{who}}"}' }),
    );
    expect(invoker.calls[0].target).toBe('localhost:50051');
    expect(invoker.calls[0].message).toEqual({ name: 'ada' });
    expect(response.ok).toBe(true);
    expect(response.type).toBe('grpc');
    expect(statusOf(response)).toBe(0);
    expect(JSON.parse(response.body)).toEqual({ message: 'hi ada' });
    expect(GrpcProtocolExtras.parse(response.protocol).statusName).toBe('OK');
  });

  it('maps a non-OK status to a failed response', async () => {
    const invoker = fakeInvoker(() => ({
      message: null,
      statusCode: 5,
      statusName: 'NOT_FOUND',
      metadata: {},
      trailers: { 'grpc-message': 'nope' },
    }));
    const response = await service(invoker).run(envelope({ target: 'localhost:50051' }));
    expect(response.ok).toBe(false);
    expect(response.summary.label).toBe('5 NOT_FOUND');
    expect(response.error).toBe('gRPC NOT_FOUND');
    expect(statusOf(response)).toBe(5);
  });

  it('applies auth headers as gRPC metadata', async () => {
    const invoker = fakeInvoker(() => ({
      message: {},
      statusCode: 0,
      statusName: 'OK',
      metadata: {},
      trailers: {},
    }));
    await service(invoker).run(
      envelope({ target: 'localhost:50051' }, { auth: { type: 'bearer', token: '{{token}}' } }),
    );
    expect(invoker.calls[0].metadata.authorization).toBe('Bearer secret');
  });

  it('rejects a non-object message before dialing', async () => {
    const invoker = fakeInvoker(() => {
      throw new Error('should not dial');
    });
    await expect(
      service(invoker).run(envelope({ target: 'localhost:50051', message: '[1,2]' })),
    ).rejects.toThrow(/valid JSON object/);
    expect(invoker.calls).toHaveLength(0);
  });

  it('reports a CANCELLED status as cancelled, not an error', async () => {
    // gRPC delivers a client cancel via the callback as status CANCELLED (1),
    // so the invoker resolves (does not throw).
    const invoker = fakeInvoker(() => ({
      message: null,
      statusCode: 1,
      statusName: 'CANCELLED',
      metadata: {},
      trailers: {},
    }));
    const response = await service(invoker).run(envelope({ target: 'localhost:50051' }));
    expect(response.cancelled).toBe(true);
    expect(response.summary.label).toBe('Cancelled');
    expect(response.summary.tone).toBe('info');
  });

  it('surfaces invoker failures as an error response', async () => {
    const invoker = fakeInvoker(() => {
      throw new Error('proto not found');
    });
    const response = await service(invoker).run(envelope({ target: 'localhost:50051' }));
    expect(response.ok).toBe(false);
    expect(response.error).toBe('proto not found');
  });

  it('honors options.timeoutMs as the deadline', async () => {
    const spy = vi.fn(
      (): GrpcUnaryResult => ({ message: {}, statusCode: 0, statusName: 'OK', metadata: {}, trailers: {} }),
    );
    const invoker = fakeInvoker(spy);
    await service(invoker).run(
      envelope({ target: 'localhost:50051', deadlineMs: 30000 }, { options: { timeoutMs: 1234 } }),
    );
    expect(invoker.calls[0].deadlineMs).toBe(1234);
  });
});
