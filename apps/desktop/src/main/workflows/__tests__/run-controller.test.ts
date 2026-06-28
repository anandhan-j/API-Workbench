// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RunController } from '../run-controller';

describe('RunController', () => {
  it('starts running, not paused or cancelled', () => {
    const c = new RunController();
    expect(c.isPaused).toBe(false);
    expect(c.isCancelled).toBe(false);
    expect(c.signal.aborted).toBe(false);
  });

  it('pauses and resumes, releasing waiters', async () => {
    const c = new RunController();
    c.pause();
    expect(c.isPaused).toBe(true);
    let resolved = false;
    const wait = c.waitIfPaused().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false); // still blocked while paused
    c.resume();
    await wait;
    expect(resolved).toBe(true);
    expect(c.isPaused).toBe(false);
  });

  it('waitIfPaused resolves immediately when not paused', async () => {
    const c = new RunController();
    await expect(c.waitIfPaused()).resolves.toBeUndefined();
  });

  it('cancel aborts the signal and unblocks any pause', async () => {
    const c = new RunController();
    c.pause();
    const wait = c.waitIfPaused();
    c.cancel();
    expect(c.isCancelled).toBe(true);
    expect(c.signal.aborted).toBe(true);
    await expect(wait).resolves.toBeUndefined();
  });

  it('cannot pause after cancellation', () => {
    const c = new RunController();
    c.cancel();
    c.pause();
    expect(c.isPaused).toBe(false);
  });
});
