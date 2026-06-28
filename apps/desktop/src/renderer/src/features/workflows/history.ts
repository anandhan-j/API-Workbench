/**
 * A tiny, pure undo/redo history over immutable snapshots. Kept framework-free
 * so it is trivially unit-testable; the canvas hook wraps it with React state.
 *
 * `present` is the live value. `commit` pushes the current present onto `past`
 * and clears `future` (a new action invalidates the redo branch). `undo`/`redo`
 * move the present between the stacks. `past` is bounded so long sessions don't
 * grow without limit.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const DEFAULT_HISTORY_LIMIT = 100;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records a new present, pushing the old one onto the undo stack. */
export function commit<T>(history: History<T>, next: T, limit = DEFAULT_HISTORY_LIMIT): History<T> {
  const past = [...history.past, history.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  };
}

/** Replaces the present without touching the stacks (e.g. live drag updates). */
export function replace<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1] as T;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0] as T;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
