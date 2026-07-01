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

  it('startStepping runs the first node, then suspends before each next node', async () => {
    const c = new RunController();
    c.startStepping();
    expect(c.isStepping).toBe(true);
    // First checkpoint (before the start node) proceeds immediately.
    await expect(c.waitIfPaused()).resolves.toBeUndefined();
    // The next checkpoint blocks until step().
    let ran = false;
    const wait = c.waitIfPaused().then(() => {
      ran = true;
    });
    await Promise.resolve();
    expect(ran).toBe(false);
    c.step();
    await wait;
    expect(ran).toBe(true);
  });

  it('step grants exactly one node per call', async () => {
    const c = new RunController();
    c.startStepping();
    await c.waitIfPaused(); // start node runs (initial budget)
    // Suspends before the next node...
    let second = false;
    const wait2 = c.waitIfPaused().then(() => {
      second = true;
    });
    await Promise.resolve();
    expect(second).toBe(false);
    c.step(); // ...one step releases exactly that node
    await wait2;
    expect(second).toBe(true);
    // ...and the following node suspends again.
    let third = false;
    c.waitIfPaused().then(() => {
      third = true;
    });
    await Promise.resolve();
    expect(third).toBe(false);
  });

  it('resume exits step mode and runs the rest to completion', async () => {
    const c = new RunController();
    c.startStepping();
    await c.waitIfPaused(); // start node
    const wait = c.waitIfPaused().then(() => undefined); // suspends
    c.resume();
    await expect(wait).resolves.toBeUndefined();
    expect(c.isStepping).toBe(false);
    await expect(c.waitIfPaused()).resolves.toBeUndefined(); // no longer stepping
  });

  it('step is a no-op after cancellation', () => {
    const c = new RunController();
    c.cancel();
    c.step();
    expect(c.isPaused).toBe(false);
  });

  it('nested checkpoints bypass stepping but still honor pause', async () => {
    const c = new RunController();
    c.startStepping();
    await c.waitIfPaused(); // top-level start node consumes the initial budget
    // A nested checkpoint (inside an inlined sub-workflow) never suspends for
    // stepping, even with no step budget left — the sub-workflow runs straight
    // through as a single step of its parent.
    await expect(c.waitIfPaused(true)).resolves.toBeUndefined();
    // ...but an explicit pause still suspends a nested checkpoint.
    c.pause();
    let released = false;
    const wait = c.waitIfPaused(true).then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    c.resume();
    await wait;
    expect(released).toBe(true);
  });
});
