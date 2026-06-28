import { useEffect } from 'react';
import { invoke, isBridgeAvailable, onDispatchEvent } from '../../lib/ipc';
import { useDispatchStore } from '../../stores/dispatch-store';

/**
 * Hydrates the dispatch store with the main process's buffered events on mount,
 * then subscribes to the live event stream. Returns nothing; state lives in the
 * dispatch store. No-ops gracefully when the Electron bridge is unavailable.
 */
export function useDispatchStream(): void {
  const setEvents = useDispatchStore((s) => s.setEvents);
  const addEvent = useDispatchStore((s) => s.addEvent);

  useEffect(() => {
    if (!isBridgeAvailable()) return;

    let active = true;
    void invoke('dispatch.getBuffer', {})
      .then((buffer) => {
        if (active) setEvents(buffer);
      })
      .catch(() => undefined);

    const unsubscribe = onDispatchEvent((event) => addEvent(event));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [setEvents, addEvent]);
}
