// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { RpcMessage } from './plugin-rpc';
import { RpcCallError, RpcEndpoint, type RpcEndpointOptions, type RpcWire } from './plugin-rpc-endpoint';

/**
 * Two endpoints over paired in-memory wires — the same symmetric setup the
 * in-process host transport uses, minus the host runtime. Messages are
 * delivered on a microtask so ordering matches a real message port.
 */
function pairedWires(): { a: RpcWire; b: RpcWire; sentByA: RpcMessage[]; sentByB: RpcMessage[] } {
  let aHandler: ((message: unknown) => void) | undefined;
  let bHandler: ((message: unknown) => void) | undefined;
  const sentByA: RpcMessage[] = [];
  const sentByB: RpcMessage[] = [];
  const a: RpcWire = {
    send: (message) => {
      sentByA.push(message);
      queueMicrotask(() => bHandler?.(message));
    },
    onMessage: (handler) => {
      aHandler = handler;
    },
  };
  const b: RpcWire = {
    send: (message) => {
      sentByB.push(message);
      queueMicrotask(() => aHandler?.(message));
    },
    onMessage: (handler) => {
      bHandler = handler;
    },
  };
  return { a, b, sentByA, sentByB };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function makePair(serverOptions: Partial<RpcEndpointOptions> = {}): {
  client: RpcEndpoint;
  server: RpcEndpoint;
  sentByClient: RpcMessage[];
  sentByServer: RpcMessage[];
} {
  const { a, b, sentByA, sentByB } = pairedWires();
  const client = new RpcEndpoint(a, {
    onRequest: () => Promise.reject(new Error('client serves nothing')),
  });
  const server = new RpcEndpoint(b, {
    onRequest: (method, params) => Promise.resolve({ echoed: { method, params } }),
    ...serverOptions,
  });
  return { client, server, sentByClient: sentByA, sentByServer: sentByB };
}

describe('RpcEndpoint', () => {
  it('round-trips a call and correlates the response', async () => {
    const { client } = makePair();
    const result = await client.call('do.thing', { n: 1 });
    expect(result).toEqual({ echoed: { method: 'do.thing', params: { n: 1 } } });
  });

  it('runs concurrent calls independently (correlation by id)', async () => {
    const { client } = makePair({
      onRequest: (_m, params) => Promise.resolve(params),
    });
    const [one, two] = await Promise.all([client.call('m', 'one'), client.call('m', 'two')]);
    expect(one).toBe('one');
    expect(two).toBe('two');
  });

  it('propagates an RpcCallError result with its code and retryable flag', async () => {
    const { client } = makePair({
      onRequest: () => Promise.reject(new RpcCallError('E_BOOM', 'kaput')),
    });
    const error = await client.call('m', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcCallError);
    expect((error as RpcCallError).code).toBe('E_BOOM');
    expect((error as RpcCallError).message).toBe('kaput');
  });

  it('maps a plain thrown Error to E_PLUGIN_ERROR', async () => {
    const { client } = makePair({
      onRequest: () => Promise.reject(new Error('plain')),
    });
    const error = await client.call('m', {}).catch((e: unknown) => e);
    expect((error as RpcCallError).code).toBe('E_PLUGIN_ERROR');
    expect((error as RpcCallError).message).toBe('plain');
  });

  it('times out, sends a cancel, and aborts the inbound handler signal', async () => {
    let inboundSignal: AbortSignal | undefined;
    const { client, sentByClient } = makePair({
      onRequest: (_m, _p, signal) => {
        inboundSignal = signal;
        return new Promise(() => undefined); // never settles
      },
    });
    const error = await client.call('slow', {}, { timeoutMs: 15 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RpcCallError);
    expect((error as RpcCallError).code).toBe('E_RPC_TIMEOUT');
    expect(sentByClient.some((m) => m.kind === 'cancel')).toBe(true);
    await flush();
    expect(inboundSignal?.aborted).toBe(true);
  });

  it('rejects immediately on a pre-aborted signal without sending anything', async () => {
    const { client, sentByClient } = makePair();
    const controller = new AbortController();
    controller.abort();
    const error = await client.call('m', {}, { signal: controller.signal }).catch((e: unknown) => e);
    expect((error as RpcCallError).code).toBe('E_RPC_CANCELLED');
    expect(sentByClient).toHaveLength(0);
  });

  it('mid-flight abort cancels the call and aborts the peer handler signal', async () => {
    let inboundSignal: AbortSignal | undefined;
    const { client, sentByClient } = makePair({
      onRequest: (_m, _p, signal) => {
        inboundSignal = signal;
        return new Promise(() => undefined);
      },
    });
    const controller = new AbortController();
    const promise = client.call('m', {}, { signal: controller.signal });
    await flush(); // let the request reach the server
    expect(inboundSignal?.aborted).toBe(false);
    controller.abort();
    const error = await promise.catch((e: unknown) => e);
    expect((error as RpcCallError).code).toBe('E_RPC_CANCELLED');
    expect(sentByClient.some((m) => m.kind === 'cancel')).toBe(true);
    await flush();
    expect(inboundSignal?.aborted).toBe(true);
  });

  it('failPending rejects every in-flight call with the given error', async () => {
    const { client } = makePair({
      onRequest: () => new Promise(() => undefined),
    });
    const first = client.call('m', 1);
    const second = client.call('m', 2);
    client.failPending({ code: 'E_HOST_CRASHED', message: 'host exited', retryable: true });
    const errors = await Promise.all([
      first.catch((e: unknown) => e),
      second.catch((e: unknown) => e),
    ]);
    for (const error of errors) {
      expect(error).toBeInstanceOf(RpcCallError);
      expect((error as RpcCallError).code).toBe('E_HOST_CRASHED');
      expect((error as RpcCallError).retryable).toBe(true);
    }
    // A late response for a failed call is ignored, not double-settled.
    await flush();
  });

  it('validateInbound drops malformed messages through onDrop', async () => {
    const { a, b } = pairedWires();
    const onDrop = vi.fn();
    const onRequest = vi.fn(() => Promise.resolve('ok'));
    new RpcEndpoint(a, { onRequest, validateInbound: true, onDrop });
    // Peer wire sends garbage straight down the pipe.
    b.send({ kind: 'nonsense' } as unknown as RpcMessage);
    b.send({ kind: 'req', id: 42, method: 'x', params: {} } as unknown as RpcMessage); // bad id type
    await flush();
    expect(onDrop).toHaveBeenCalledTimes(2);
    expect(onRequest).not.toHaveBeenCalled();
  });

  it('valid messages still flow when validateInbound is on', async () => {
    const { a, b } = pairedWires();
    new RpcEndpoint(a, {
      onRequest: () => Promise.resolve('served'),
      validateInbound: true,
    });
    const caller = new RpcEndpoint(b, {
      onRequest: () => Promise.reject(new Error('unused')),
    });
    await expect(caller.call('m', {})).resolves.toBe('served');
  });

  it('delivers events to the peer onEvent handler', async () => {
    const { a, b } = pairedWires();
    const events: Array<[string, unknown]> = [];
    new RpcEndpoint(a, {
      onRequest: () => Promise.reject(new Error('unused')),
      onEvent: (topic, payload) => events.push([topic, payload]),
    });
    const emitter = new RpcEndpoint(b, {
      onRequest: () => Promise.reject(new Error('unused')),
    });
    emitter.emit('host.ready', { sdkVersion: '1.0.0' });
    await flush();
    expect(events).toEqual([['host.ready', { sdkVersion: '1.0.0' }]]);
  });

  it('a response with an unknown id is ignored', async () => {
    const { a, b } = pairedWires();
    new RpcEndpoint(a, { onRequest: () => Promise.resolve('ok') });
    expect(() => b.send({ kind: 'res', id: 'nope', ok: true, result: 1 })).not.toThrow();
    await flush();
  });
});
