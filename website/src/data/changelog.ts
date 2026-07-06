export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  features?: string[];
  improvements?: string[];
  fixes?: string[];
  breaking?: string[];
}

/** Pre-release milestones, newest first. Tracks the phase-by-phase delivery. */
export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.0-alpha.6',
    date: '2026-07',
    title: 'Interactive sessions & plugin parity',
    features: [
      'Live interactive sessions for WebSocket, SSE, and plugin request types — send frames and watch a scrolling event log.',
      'Plugin request types reach protocol parity: interactive connections, auth artifacts, and protocol-specific extras.',
      'Inline renaming for collections and folders directly in the tree.',
    ],
    improvements: [
      'Connection session lifecycle management with clearer error reporting.',
      'User-input node editor gains drag-and-drop field reordering with FLIP animation.',
    ],
    fixes: ['Session teardown races on window close.', 'Prompt fields with runtime-filled lists submit consistent JSON.'],
  },
  {
    version: '0.1.0-alpha.5',
    date: '2026-06',
    title: 'Multi-protocol execution',
    features: [
      'GraphQL, gRPC, WebSocket, and SSE support in the runner and workflows.',
      'Protocol-agnostic RequestEnvelope / ProtocolResponse execution model; HTTP becomes built-in provider #1.',
      'Workflow prompt nodes: approvals, dropdown selections, and key-value input mid-run.',
    ],
    improvements: ['Generic response viewer renders any protocol result with metadata tables and tone chips.'],
  },
  {
    version: '0.1.0-alpha.4',
    date: '2026-05',
    title: 'Plugin SDK (Phase 16)',
    features: [
      'Plugin loader, install lifecycle, and package validation.',
      'Four extension points: workflow nodes, request types, auth providers, importers.',
      'Sandboxed plugin host in an Electron utility process with a Zod-validated RPC bridge.',
      'Capability broker: network, variables, and dialog access require user-confirmed grants.',
      '@api-workbench/plugin-sdk published as a types-only contract package.',
    ],
    breaking: ['Node kinds, request types, auth types, and importer ids are now namespaced as plugin:<pluginId>/<key>.'],
  },
  {
    version: '0.1.0-alpha.3',
    date: '2026-04',
    title: 'Workflow platform (Phases 12–15)',
    features: [
      'Deterministic workflow engine with variable propagation between steps.',
      'Visual designer: drag-and-drop canvas, grouping, undo/redo, clipboard, mini map.',
      'Runtime: parallel branches, conditions, loops, switch, retries, timeouts, pause/resume/cancel.',
      'Data mapping with JSONPath, JMESPath, regex extraction, and an expression editor with preview.',
    ],
    improvements: ['Workflow request nodes reuse the execution engine and stored credentials — no separate HTTP path.'],
  },
  {
    version: '0.1.0-alpha.2',
    date: '2026-02',
    title: 'Execution, variables, auth & testing (Phases 8–11)',
    features: [
      'Scoped variable engine with encrypted secrets behind the OS keychain.',
      'Authentication framework: Bearer, OAuth2 (with refresh), Basic, Digest, API Key, Cookies, AWS SigV4, client certificates.',
      'REST execution engine: streaming, multipart, uploads/downloads, retries, redirects, cancellation.',
      'Assertions, JSON Schema validation, custom JavaScript tests, and test reports.',
    ],
    fixes: ['Variable precedence across folder/request scopes.', 'Digest auth nonce reuse.'],
  },
  {
    version: '0.1.0-alpha.1',
    date: '2025-12',
    title: 'Foundation & OpenAPI (Phases 1–7)',
    features: [
      'Electron + React + TypeScript foundation with light/dark theming.',
      'SQLite persistence with append-only migrations, transactions, and backup/restore.',
      'Workspaces, collections, folders, and virtualized request trees.',
      'OpenAPI 3.x / Swagger 2 import from JSON, YAML, and URLs.',
      'Spec synchronization with safe merge and conflict detection.',
      'Collection version control: snapshots, diff viewer, rollback.',
    ],
  },
];
