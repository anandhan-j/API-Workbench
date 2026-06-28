import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

export interface TabItem {
  id: string;
  title: string;
  /** Router path this tab maps to. */
  path: string;
  closable: boolean;
}

interface UiState {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  monitorOpen: boolean;
  tabs: TabItem[];
  activeTabId: string;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleSidebar: () => void;
  toggleMonitor: () => void;
  setActiveTab: (id: string) => void;
  openTab: (tab: TabItem) => void;
  closeTab: (id: string) => void;
}

const DEFAULT_TABS: TabItem[] = [
  { id: 'home', title: 'Home', path: '/', closable: false },
];

export const useUiStore = create<UiState>((set) => ({
  theme: 'dark',
  sidebarCollapsed: false,
  monitorOpen: true,
  tabs: DEFAULT_TABS,
  activeTabId: 'home',

  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setTheme: (theme) => set({ theme }),
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
        s.activeTabId === id ? (remaining[remaining.length - 1]?.id ?? 'home') : s.activeTabId;
      return { tabs: remaining, activeTabId };
    }),
}));
