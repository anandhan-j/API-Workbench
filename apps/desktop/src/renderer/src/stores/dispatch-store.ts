import { create } from 'zustand';
import type { DispatchEvent, LogLevel } from '@shared/ipc-contract';

const MAX_EVENTS = 1000;

interface DispatchState {
  events: DispatchEvent[];
  levelFilter: LogLevel | 'all';
  paused: boolean;
  addEvent: (event: DispatchEvent) => void;
  setEvents: (events: DispatchEvent[]) => void;
  setLevelFilter: (level: LogLevel | 'all') => void;
  togglePaused: () => void;
  clear: () => void;
}

export const useDispatchStore = create<DispatchState>((set) => ({
  events: [],
  levelFilter: 'all',
  paused: false,

  addEvent: (event) =>
    set((s) => {
      if (s.paused) return s;
      const next = [...s.events, event];
      return { events: next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next };
    }),

  setEvents: (events) => set({ events: events.slice(-MAX_EVENTS) }),
  setLevelFilter: (levelFilter) => set({ levelFilter }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  clear: () => set({ events: [] }),
}));

/** Pure selector: events filtered by the active level filter. */
export function selectFilteredEvents(state: DispatchState): DispatchEvent[] {
  if (state.levelFilter === 'all') return state.events;
  return state.events.filter((e) => e.level === state.levelFilter);
}
