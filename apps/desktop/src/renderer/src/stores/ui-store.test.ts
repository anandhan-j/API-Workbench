import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './ui-store';

const reset = (): void =>
  useUiStore.setState({
    theme: 'dark',
    sidebarCollapsed: false,
    monitorOpen: true,
    tabs: [{ id: 'home', title: 'Home', path: '/', closable: false }],
    activeTabId: 'home',
  });

describe('ui-store', () => {
  beforeEach(reset);

  it('toggles theme between dark and light', () => {
    expect(useUiStore.getState().theme).toBe('dark');
    useUiStore.getState().toggleTheme();
    expect(useUiStore.getState().theme).toBe('light');
  });

  it('opens a new tab and activates it', () => {
    useUiStore.getState().openTab({ id: 'settings', title: 'Settings', path: '/settings', closable: true });
    const state = useUiStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe('settings');
  });

  it('does not duplicate an already-open tab', () => {
    const tab = { id: 'settings', title: 'Settings', path: '/settings', closable: true };
    useUiStore.getState().openTab(tab);
    useUiStore.getState().openTab(tab);
    expect(useUiStore.getState().tabs).toHaveLength(2);
  });

  it('closes a closable tab and falls back to home', () => {
    useUiStore.getState().openTab({ id: 'settings', title: 'Settings', path: '/settings', closable: true });
    useUiStore.getState().closeTab('settings');
    const state = useUiStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe('home');
  });

  it('refuses to close a non-closable tab', () => {
    useUiStore.getState().closeTab('home');
    expect(useUiStore.getState().tabs).toHaveLength(1);
  });
});
