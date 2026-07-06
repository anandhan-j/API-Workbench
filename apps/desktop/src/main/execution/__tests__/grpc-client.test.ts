// @vitest-environment node
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { createGrpcInvoker } from '../grpc/grpc-client';

const PROTO = join(__dirname, 'fixtures', 'greeter.proto');

/** Drives the production gRPC invoker against a real @grpc/grpc-js server. */
describe('createGrpcInvoker (real server)', () => {
  let server: grpc.Server;
  let target: string;

  beforeAll(async () => {
    const pkg = grpc.loadPackageDefinition(
      protoLoader.loadSync(PROTO, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }),
    ) as unknown as { greeter: { Greeter: { service: grpc.ServiceDefinition } } };
    server = new grpc.Server();
    server.addService(pkg.greeter.Greeter.service, {
      SayHello: (
        call: { request: { name?: string }; metadata: grpc.Metadata },
        cb: grpc.sendUnaryData<{ message: string }>,
      ) => {
        if (call.request.name === 'missing') {
          cb({ code: grpc.status.NOT_FOUND, message: 'no such greeting' } as grpc.ServiceError, null);
          return;
        }
        const trailers = new grpc.Metadata();
        trailers.set('seen-auth', call.metadata.get('authorization')[0]?.toString() ?? 'none');
        cb(null, { message: `hi ${call.request.name ?? '?'}` }, trailers);
      },
    });
    target = await new Promise<string>((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return reject(err);
        resolve(`127.0.0.1:${port}`);
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.tryShutdown(() => r()));
  });

  function base() {
    return {
      protoFile: PROTO,
      importDirs: [] as string[],
      service: 'greeter.Greeter',
      method: 'SayHello',
      metadata: {} as Record<string, string>,
      useTls: false,
      deadlineMs: 3000,
    };
  }

  it('dials a unary call and returns OK with the response message', async () => {
    const result = await createGrpcInvoker().invokeUnary({ ...base(), target, message: { name: 'ada' } });
    expect(result.statusCode).toBe(grpc.status.OK);
    expect(result.statusName).toBe('OK');
    expect(result.message).toMatchObject({ message: 'hi ada' });
  });

  it('passes metadata to the server and returns trailers', async () => {
    const result = await createGrpcInvoker().invokeUnary({
      ...base(),
      target,
      message: { name: 'ada' },
      metadata: { authorization: 'Bearer secret' },
    });
    expect(result.trailers['seen-auth']).toBe('Bearer secret');
  });

  it('surfaces a non-OK status without throwing', async () => {
    const result = await createGrpcInvoker().invokeUnary({ ...base(), target, message: { name: 'missing' } });
    expect(result.statusCode).toBe(grpc.status.NOT_FOUND);
    expect(result.statusName).toBe('NOT_FOUND');
    expect(result.message).toBeNull();
  });

  it('rejects with a helpful error when the proto method is unknown', async () => {
    await expect(
      createGrpcInvoker().invokeUnary({ ...base(), method: 'Nope', target, message: {} }),
    ).rejects.toThrow(/Method "Nope" not found/);
  });
});
