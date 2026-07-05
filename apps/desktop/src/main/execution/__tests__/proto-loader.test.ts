// @vitest-environment node
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadUnaryMethod } from '../grpc/proto-loader';

const PROTO = join(__dirname, 'fixtures', 'greeter.proto');

describe('loadUnaryMethod', () => {
  it('resolves a unary method path and exposes request/response codecs', () => {
    const method = loadUnaryMethod(PROTO, [], 'greeter.Greeter', 'SayHello');
    expect(method.path).toBe('/greeter.Greeter/SayHello');
    // serialize is the request codec (HelloRequest.name), deserialize the
    // response codec (HelloReply.message) — both are field 1, so the value
    // survives the round-trip even though the field name differs.
    const bytes = method.serialize({ name: 'ada' });
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(method.deserialize(bytes)).toMatchObject({ message: 'ada' });
  });

  it('throws a helpful error for an unknown service', () => {
    expect(() => loadUnaryMethod(PROTO, [], 'greeter.Nope', 'SayHello')).toThrow(
      /Service "greeter.Nope" not found.*Greeter/s,
    );
  });

  it('throws a helpful error for an unknown method', () => {
    expect(() => loadUnaryMethod(PROTO, [], 'greeter.Greeter', 'Missing')).toThrow(
      /Method "Missing" not found.*SayHello/s,
    );
  });

  it('requires a proto file path', () => {
    expect(() => loadUnaryMethod('  ', [], 'greeter.Greeter', 'SayHello')).toThrow(/required/);
  });
});
