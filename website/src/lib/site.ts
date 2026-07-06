/** Central site constants — edit here, reflected everywhere. */

export const site = {
  name: 'API Workbench',
  tagline: 'Offline-first API testing & visual workflow automation',
  description:
    'A free, open-source desktop app for API testing and drag-and-drop API workflow automation. Import OpenAPI specs and keep them in sync, run REST, GraphQL, gRPC, WebSocket and SSE requests, and extend everything with plugins — all stored locally in SQLite.',
  version: '0.1.0',
  repoOwner: 'anandhan-j',
  repoName: 'API-Workbench',
  repoUrl: 'https://github.com/anandhan-j/API-Workbench',
  releasesUrl: 'https://github.com/anandhan-j/API-Workbench/releases',
  issuesUrl: 'https://github.com/anandhan-j/API-Workbench/issues',
  discussionsUrl: 'https://github.com/anandhan-j/API-Workbench/discussions',
  siteUrl: 'https://anandhan-j.github.io/API-Workbench',
  author: 'Anandhan J',
  license: 'MIT',
  sdkPackage: '@api-workbench/plugin-sdk',
} as const;

export interface NavItem {
  label: string;
  to: string;
  external?: boolean;
}

export const navItems: NavItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Features', to: '/features' },
  { label: 'Workflow', to: '/workflow' },
  { label: 'Docs', to: '/docs' },
  { label: 'Plugins', to: '/plugins' },
  { label: 'Examples', to: '/examples' },
  { label: 'Gallery', to: '/gallery' },
  { label: 'Downloads', to: '/downloads' },
  { label: 'Roadmap', to: '/roadmap' },
  { label: 'GitHub', to: site.repoUrl, external: true },
];

export const footerColumns: Array<{ title: string; links: NavItem[] }> = [
  {
    title: 'Project',
    links: [
      { label: 'Features', to: '/features' },
      { label: 'Workflow', to: '/workflow' },
      { label: 'Downloads', to: '/downloads' },
      { label: 'Roadmap', to: '/roadmap' },
      { label: 'Changelog', to: '/changelog' },
      { label: 'About', to: '/about' },
    ],
  },
  {
    title: 'Documentation',
    links: [
      { label: 'Getting Started', to: '/docs' },
      { label: 'Plugin SDK', to: '/plugins' },
      { label: 'Examples', to: '/examples' },
      { label: 'Screenshots', to: '/screenshots' },
      { label: 'FAQ', to: '/faq' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'GitHub', to: site.repoUrl, external: true },
      { label: 'Issues', to: site.issuesUrl, external: true },
      { label: 'Discussions', to: site.discussionsUrl, external: true },
      { label: 'Contributing', to: '/contributing' },
      { label: 'Contact', to: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'License (MIT)', to: '/license' },
      { label: 'Releases', to: site.releasesUrl, external: true },
    ],
  },
];
