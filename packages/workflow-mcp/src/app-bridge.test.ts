import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { APP_RPC_PREFIX, createAppBridge } from './app-bridge.js';

/** A minimal readable-ish stream: EventEmitter with the methods the bridge calls. */
function fakeStdin(): EventEmitter & { setEncoding: () => void; resume: () => void; feed: (s: string) => void } {
  const em = new EventEmitter() as EventEmitter & {
    setEncoding: () => void;
    resume: () => void;
    feed: (s: string) => void;
  };
  em.setEncoding = () => undefined;
  em.resume = () => undefined;
  em.feed = (s: string) => em.emit('data', s);
  return em;
}

describe('createAppBridge', () => {
  it('reports availability from the enabled flag', () => {
    const bridge = createAppBridge({ enabled: false, stdout: { write: () => {} }, stdin: fakeStdin() as never });
    expect(bridge.available).toBe(false);
  });

  it('short-circuits when disabled without writing', async () => {
    const write = vi.fn();
    const bridge = createAppBridge({ enabled: false, stdout: { write }, stdin: fakeStdin() as never });
    const res = await bridge.call('importWorkflow', { a: 1 });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('not available') });
    expect(write).not.toHaveBeenCalled();
  });

  it('writes a prefixed request and resolves the matching response', async () => {
    const written: string[] = [];
    const stdin = fakeStdin();
    const bridge = createAppBridge({
      enabled: true,
      stdout: { write: (s) => written.push(s) },
      stdin: stdin as never,
    });

    const p = bridge.call('importWorkflow', { workflow: { x: 1 } });

    expect(written).toHaveLength(1);
    expect(written[0]!.startsWith(APP_RPC_PREFIX)).toBe(true);
    const sent = JSON.parse(written[0]!.slice(APP_RPC_PREFIX.length));
    expect(sent).toMatchObject({ id: 1, method: 'importWorkflow', params: { workflow: { x: 1 } } });

    stdin.feed(`${JSON.stringify({ id: sent.id, ok: true, result: { id: 'wf-1' } })}\n`);
    await expect(p).resolves.toEqual({ ok: true, result: { id: 'wf-1' } });
  });

  it('correlates responses by id across concurrent calls', async () => {
    const written: string[] = [];
    const stdin = fakeStdin();
    const bridge = createAppBridge({
      enabled: true,
      stdout: { write: (s) => written.push(s) },
      stdin: stdin as never,
    });

    const a = bridge.call('importWorkflow', { n: 'a' });
    const b = bridge.call('importWorkflow', { n: 'b' });
    const idA = JSON.parse(written[0]!.slice(APP_RPC_PREFIX.length)).id;
    const idB = JSON.parse(written[1]!.slice(APP_RPC_PREFIX.length)).id;

    // Reply to B first, then A — resolution must follow ids, not arrival order.
    stdin.feed(`${JSON.stringify({ id: idB, ok: false, error: 'nope' })}\n`);
    stdin.feed(`${JSON.stringify({ id: idA, ok: true, result: 1 })}\n`);

    await expect(a).resolves.toEqual({ ok: true, result: 1 });
    await expect(b).resolves.toEqual({ ok: false, error: 'nope' });
  });

  it('times out when the app never replies', async () => {
    const stdin = fakeStdin();
    const bridge = createAppBridge({ enabled: true, stdout: { write: () => {} }, stdin: stdin as never });
    const res = await bridge.call('importWorkflow', {}, 5);
    expect(res).toEqual({ ok: false, error: expect.stringContaining('did not respond') });
  });
});
