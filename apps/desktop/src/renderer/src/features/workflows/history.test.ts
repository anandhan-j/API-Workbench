import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, initHistory, redo, replace, undo } from './history';

describe('history', () => {
  it('starts empty with the given present', () => {
    const h = initHistory(1);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('commits, undoes, and redoes', () => {
    let h = initHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    expect(h.present).toBe(2);
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(0);
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(false);
  });

  it('clears the redo branch on a new commit', () => {
    let h = initHistory(0);
    h = commit(h, 1);
    h = commit(h, 2);
    h = undo(h); // present 1, future [2]
    expect(canRedo(h)).toBe(true);
    h = commit(h, 99); // new branch
    expect(h.present).toBe(99);
    expect(canRedo(h)).toBe(false);
  });

  it('replace updates the present without affecting the stacks', () => {
    let h = initHistory(0);
    h = commit(h, 1);
    const before = { past: h.past.length, future: h.future.length };
    h = replace(h, 5);
    expect(h.present).toBe(5);
    expect(h.past.length).toBe(before.past);
    expect(h.future.length).toBe(before.future);
  });

  it('bounds the undo stack to the limit', () => {
    let h = initHistory(0);
    for (let i = 1; i <= 10; i++) h = commit(h, i, 3);
    expect(h.past.length).toBe(3);
    expect(h.present).toBe(10);
  });

  it('undo/redo at the boundaries are no-ops', () => {
    const h = initHistory(0);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});
