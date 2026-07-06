import { appDocs } from './content/app';
import { pluginDocs } from './content/plugins';
import { blocksToText } from './render';
import type { DocPage, DocSet } from './types';

export const docSets: DocSet[] = [appDocs, pluginDocs];

export interface FlatDocPage extends DocPage {
  path: string;
  setTitle: string;
  sectionTitle: string;
}

function flatten(set: DocSet): FlatDocPage[] {
  return set.sections.flatMap((section) =>
    section.pages.map((page) => ({
      ...page,
      path: `${set.basePath}/${page.slug}`,
      setTitle: set.title,
      sectionTitle: section.title,
    }))
  );
}

export const flatPages: Record<string, FlatDocPage[]> = {
  [appDocs.basePath]: flatten(appDocs),
  [pluginDocs.basePath]: flatten(pluginDocs),
};

export function findPage(basePath: string, slug: string | undefined): FlatDocPage | undefined {
  const pages = flatPages[basePath];
  if (!pages) return undefined;
  return slug ? pages.find((p) => p.slug === slug) : pages[0];
}

export function prevNext(basePath: string, slug: string): { prev?: FlatDocPage; next?: FlatDocPage } {
  const pages = flatPages[basePath] ?? [];
  const idx = pages.findIndex((p) => p.slug === slug);
  if (idx === -1) return {};
  return { prev: pages[idx - 1], next: pages[idx + 1] };
}

/* ---------------------------------- search ---------------------------------- */

export interface SearchEntry {
  title: string;
  path: string;
  group: string;
  description: string;
  /** Lowercased haystack: title + description + body text. */
  haystack: string;
}

const staticPages: Array<Omit<SearchEntry, 'haystack'> & { keywords?: string }> = [
  { title: 'Home', path: '/', group: 'Pages', description: 'Overview of API Workbench' },
  { title: 'Features', path: '/features', group: 'Pages', description: 'Everything the app can do', keywords: 'feature list capabilities' },
  { title: 'Workflow', path: '/workflow', group: 'Pages', description: 'From install to automated runs', keywords: 'journey steps how it works' },
  { title: 'Examples', path: '/examples', group: 'Pages', description: 'Example plugin projects', keywords: 'sample template demo' },
  { title: 'Gallery', path: '/gallery', group: 'Pages', description: 'UI gallery with filtering' },
  { title: 'Screenshots', path: '/screenshots', group: 'Pages', description: 'Annotated application screens' },
  { title: 'Downloads', path: '/downloads', group: 'Pages', description: 'Installers for Windows, macOS, Linux', keywords: 'install release binary' },
  { title: 'FAQ', path: '/faq', group: 'Pages', description: 'Frequently asked questions' },
  { title: 'Roadmap', path: '/roadmap', group: 'Pages', description: 'Delivery phases and status' },
  { title: 'Contributing', path: '/contributing', group: 'Pages', description: 'How to contribute', keywords: 'pull request fork build' },
  { title: 'Changelog', path: '/changelog', group: 'Pages', description: 'Release notes by version', keywords: 'release notes versions' },
  { title: 'About', path: '/about', group: 'Pages', description: 'The story and principles' },
  { title: 'License', path: '/license', group: 'Pages', description: 'MIT license terms', keywords: 'mit open source legal' },
  { title: 'Contact', path: '/contact', group: 'Pages', description: 'Get in touch' },
];

export const searchIndex: SearchEntry[] = [
  ...staticPages.map((p) => ({
    ...p,
    haystack: `${p.title} ${p.description} ${p.keywords ?? ''}`.toLowerCase(),
  })),
  ...docSets.flatMap((set) =>
    flatten(set).map((page) => ({
      title: page.title,
      path: page.path,
      group: set.title,
      description: page.description,
      haystack: `${page.title} ${page.description} ${blocksToText(page.blocks)}`.toLowerCase(),
    }))
  ),
];

export function search(query: string, limit = 12): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  return searchIndex
    .map((entry) => {
      let score = 0;
      for (const term of terms) {
        if (!entry.haystack.includes(term)) return null;
        if (entry.title.toLowerCase().includes(term)) score += 10;
        if (entry.description.toLowerCase().includes(term)) score += 4;
        score += 1;
      }
      if (entry.title.toLowerCase().startsWith(q)) score += 8;
      return { entry, score };
    })
    .filter((x): x is { entry: SearchEntry; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}
