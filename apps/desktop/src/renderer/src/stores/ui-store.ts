import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

export interface TabItem {
  id: string;
  title: string;
  /** Router path this tab maps to. */
  path: string;
  closable: boolean;
}

/** Font-scale bounds and step for the Settings font-size control (root rem multiplier). */
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.1;

const clampFontScale = (v: number): number =>
  Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(v * 10) / 10));

interface UiState {
  theme: ThemeMode;
  /** Root font-size multiplier (1 = default); scales all rem-based UI text. */
  fontScale: number;
  sidebarCollapsed: boolean;
  monitorOpen: boolean;
  tabs: TabItem[];
  activeTabId: string;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  increaseFontScale: () => void;
  decreaseFontScale: () => void;
  setFontScale: (scale: number) => void;
  resetFontScale: () => void;
  toggleSidebar: () => void;
  toggleMonitor: () => void;
  setActiveTab: (id: string) => void;
  openTab: (tab: TabItem) => void;
  closeTab: (id: string) => void;
}

const DEFAULT_TABS: TabItem[] = [];

/**
 * Global UI store. User preferences (theme, font scale, dispatch-monitor
 * visibility) are persisted to localStorage so they survive a reload; transient
 * session state (open tabs, active tab, sidebar collapse) is intentionally not.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      fontScale: 1,
      sidebarCollapsed: true,
      monitorOpen: false,
      tabs: DEFAULT_TABS,
      activeTabId: '',

      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (theme) => set({ theme }),
      increaseFontScale: () =>
        set((s) => ({ fontScale: clampFontScale(s.fontScale + FONT_SCALE_STEP) })),
      decreaseFontScale: () =>
        set((s) => ({ fontScale: clampFontScale(s.fontScale - FONT_SCALE_STEP) })),
      setFontScale: (scale) => set({ fontScale: clampFontScale(scale) }),
      resetFontScale: () => set({ fontScale: 1 }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleMonitor: () => set((s) => ({ monitorOpen: !s.monitorOpen })),
      setActiveTab: (id) => set({ activeTabId: id }),

      openTab: (tab) =>
        set((s) => {
          const exists = s.tabs.some((t) => t.id === tab.id);
          return {
            tabs: exists ? s.tabs : [...s.tabs, tab],
            activeTabId: tab.id,
          };
        }),

      closeTab: (id) =>
        set((s) => {
          const target = s.tabs.find((t) => t.id === id);
          if (!target || !target.closable) return s;
          const remaining = s.tabs.filter((t) => t.id !== id);
          const activeTabId =
            s.activeTabId === id ? (remaining[remaining.length - 1]?.id ?? '') : s.activeTabId;
          return { tabs: remaining, activeTabId };
        }),
    }),
    {
      name: 'awb.ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist only user preferences; keep tabs/sidebar/active tab session-local.
      partialize: (s) => ({
        theme: s.theme,
        fontScale: s.fontScale,
        monitorOpen: s.monitorOpen,
      }),
    },
  ),
);
