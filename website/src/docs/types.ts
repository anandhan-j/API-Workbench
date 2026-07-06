import type { MockupKind } from '../components/Mockups';

/**
 * Documentation content model. Pages are authored as typed block arrays so
 * every page gets identical styling, search indexing, and theming for free.
 * Inline markdown (`code`, **bold**, [links](/path)) is supported in text.
 */

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'code'; lang: string; code: string; title?: string }
  | { kind: 'callout'; tone: 'note' | 'tip' | 'warning' | 'danger'; title?: string; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'tabs'; tabs: Array<{ label: string; blocks: Block[] }> }
  | { kind: 'mockup'; mockup: MockupKind; caption?: string };

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  blocks: Block[];
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export interface DocSet {
  /** Route base, e.g. "/docs" or "/plugins". */
  basePath: string;
  title: string;
  sections: DocSection[];
}
