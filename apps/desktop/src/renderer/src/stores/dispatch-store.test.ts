import { beforeEach, describe, expect, it } from 'vitest';
import type { DispatchEvent } from '@shared/ipc-contract';
import { selectFilteredEvents, useDispatchStore } from './dispatch-store';

let counter = 0;
const makeEvent = (level: DispatchEvent['level']): DispatchEvent => ({
  id: `e${counter++}`,
  timestamp: Date.now(),
  level,
  source: 'test',
  message: `msg ${level}`,
});

describe('dispatch-store', () => {
  beforeEach(() => {
    useDispatchStore.setState({ events: [], levelFilter: 'all', paused: false });
  });

  it('appends events', () => {
    useDispatchStore.getState().addEvent(makeEvent('info'));
    expect(useDispatchStore.getState().events).toHaveLength(1);
  });

  it('ignores events while paused', () => {
    useDispatchStore.getState().togglePaused();
    useDispatchStore.getState().addEvent(makeEvent('info'));
    expect(useDispatchStore.getState().events).toHaveLength(0);
  });

  it('filters by level via the selector', () => {
    const { addEvent, setLevelFilter } = useDispatchStore.getState();
    addEvent(makeEvent('info'));
    addEvent(makeEvent('error'));
    addEvent(makeEvent('error'));
    setLevelFilter('error');
    const filtered = selectFilteredEvents(useDispatchStore.getState());
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.level === 'error')).toBe(true);
  });

  it('replaces the buffer with setEvents', () => {
    useDispatchStore.getState().setEvents([makeEvent('warn'), makeEvent('warn')]);
    expect(useDispatchStore.getState().events).toHaveLength(2);
  });
});
