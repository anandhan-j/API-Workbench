import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Like `useState`, but the value is persisted to `localStorage` under `key` and
 * restored on the next mount — so UI state (e.g. which collections/folders are
 * expanded) survives an app restart. Falls back to in-memory state if storage is
 * unavailable.
 */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  // Avoid re-reading when the key changes; just persist the current value.
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    try {
      localStorage.setItem(keyRef.current, JSON.stringify(state));
    } catch {
      /* storage unavailable — keep state in memory only */
    }
  }, [state]);

  return [state, setState];
}
