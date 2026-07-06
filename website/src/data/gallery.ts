import type { MockupKind } from '../components/Mockups';

export type GalleryCategory = 'Dashboard' | 'Workflow' | 'Plugins' | 'Settings' | 'Themes' | 'Editor' | 'Terminal';

export interface GalleryItem {
  kind: MockupKind;
  tone?: 'dark' | 'light';
  title: string;
  caption: string;
  category: GalleryCategory;
}

export const galleryCategories: GalleryCategory[] = ['Dashboard', 'Editor', 'Workflow', 'Plugins', 'Settings', 'Terminal', 'Themes'];

export const galleryItems: GalleryItem[] = [
  { kind: 'requests', title: 'Request Editor', caption: 'Compose, send, and inspect requests with variables and auth applied.', category: 'Editor' },
  { kind: 'requests', tone: 'light', title: 'Request Editor — Light', caption: 'The same editor in the light theme.', category: 'Editor' },
  { kind: 'workflow', title: 'Workflow Designer', caption: 'Drag-and-drop canvas with branching, loops, and a mini map.', category: 'Workflow' },
  { kind: 'terminal', title: 'Workflow Run Log', caption: 'Step-by-step run output with retries and assertions.', category: 'Terminal' },
  { kind: 'plugins', title: 'Plugin Manager', caption: 'Install, enable, and grant capabilities to plugins.', category: 'Plugins' },
  { kind: 'variables', title: 'Variables & Secrets', caption: 'Scoped variables with OS-keychain-encrypted secrets.', category: 'Dashboard' },
  { kind: 'diff', title: 'OpenAPI Sync', caption: 'Review spec changes and merge without losing manual edits.', category: 'Dashboard' },
  { kind: 'settings', title: 'Settings', caption: 'Appearance, editor, network, and backup preferences.', category: 'Settings' },
  { kind: 'settings', tone: 'light', title: 'Settings — Light', caption: 'Settings panel in the light theme.', category: 'Settings' },
  { kind: 'themes', title: 'Theme System', caption: 'Dark and light side by side — every panel is themed.', category: 'Themes' },
  { kind: 'workflow', tone: 'light', title: 'Workflow Designer — Light', caption: 'The canvas adapts fully to the light theme.', category: 'Workflow' },
  { kind: 'terminal', tone: 'light', title: 'Run Log — Light', caption: 'Console output with light syntax colors.', category: 'Terminal' },
];
