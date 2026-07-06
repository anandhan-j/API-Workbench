export interface Feature {
  icon: string; // lucide icon name resolved in FeatureIcon
  title: string;
  description: string;
  category: 'core' | 'protocols' | 'workflows' | 'platform' | 'extensibility';
}

export const featureCategories: Array<{ key: Feature['category']; label: string }> = [
  { key: 'core', label: 'API Testing Core' },
  { key: 'protocols', label: 'Protocols' },
  { key: 'workflows', label: 'Workflow Automation' },
  { key: 'extensibility', label: 'Extensibility' },
  { key: 'platform', label: 'Platform & Security' },
];

export const features: Feature[] = [
  // Core
  {
    icon: 'FileJson',
    title: 'OpenAPI Import',
    description: 'Import OpenAPI 3.x and Swagger 2 specs from JSON, YAML, or a URL. Collections, folders, operations, examples, and schemas are generated for you — large enterprise specs included.',
    category: 'core',
  },
  {
    icon: 'RefreshCw',
    title: 'Spec Synchronization',
    description: 'Re-import a changed spec and merge safely. The diff engine detects added, changed, and removed endpoints while preserving every manual edit you made.',
    category: 'core',
  },
  {
    icon: 'History',
    title: 'Collection Version Control',
    description: 'Automatic snapshots around imports and syncs, a visual diff viewer, and one-click rollback to any previous version of a collection.',
    category: 'core',
  },
  {
    icon: 'Braces',
    title: 'Scoped Variables',
    description: 'Seven variable scopes — global, workspace, collection, folder, request, workflow, runtime — resolved with strict precedence and {{template}} substitution everywhere.',
    category: 'core',
  },
  {
    icon: 'Lock',
    title: 'Encrypted Secrets',
    description: 'Secret variables are encrypted with your OS keychain, decrypted only in the main process, and never exposed to the UI as plaintext.',
    category: 'core',
  },
  {
    icon: 'KeyRound',
    title: '8 Auth Schemes',
    description: 'Bearer, OAuth2 with token refresh, Basic, Digest, API Key, Cookies, AWS SigV4, and client certificates — stored once, reused across requests and workflows.',
    category: 'core',
  },
  {
    icon: 'FlaskConical',
    title: 'Tests & Assertions',
    description: 'Status, header, body, and JSON Schema assertions plus custom JavaScript tests, run by a built-in test runner with clear reports.',
    category: 'core',
  },
  {
    icon: 'Code2',
    title: 'Request Scripting',
    description: 'Pre-request and post-response scripts run in a sandbox with access to variables, so you can chain values and enforce conventions.',
    category: 'core',
  },
  {
    icon: 'FolderTree',
    title: 'Fast Collection Trees',
    description: 'Virtualized trees with move, copy, rename, favourites, history, and search stay responsive past 10,000 requests.',
    category: 'core',
  },
  // Protocols
  {
    icon: 'Globe',
    title: 'REST Execution',
    description: 'Streaming, multipart, uploads, downloads, retries, timeouts, redirects, and cancellation, with per-request performance metrics.',
    category: 'protocols',
  },
  {
    icon: 'Hexagon',
    title: 'GraphQL',
    description: 'Queries, mutations, and variables with a response viewer that understands GraphQL errors — usable standalone or inside workflows.',
    category: 'protocols',
  },
  {
    icon: 'Network',
    title: 'gRPC',
    description: 'Call unary gRPC methods with metadata and deadline control; responses render in the same protocol-agnostic viewer.',
    category: 'protocols',
  },
  {
    icon: 'Radio',
    title: 'WebSocket & SSE',
    description: 'Open live interactive sessions: send frames, watch a scrolling event log, and reuse the session data in workflow steps.',
    category: 'protocols',
  },
  {
    icon: 'Eye',
    title: 'Smart Response Viewer',
    description: 'Pretty JSON, XML, HTML, and binary views with headers, cookies, timing, and size breakdowns for every execution.',
    category: 'protocols',
  },
  // Workflows
  {
    icon: 'Workflow',
    title: 'Visual Workflow Designer',
    description: 'A React Flow canvas with drag-and-drop nodes, grouping, undo/redo, clipboard, mini map, and smooth pan/zoom.',
    category: 'workflows',
  },
  {
    icon: 'GitBranch',
    title: 'Conditions, Loops & Switch',
    description: 'Branch on any expression, loop over arrays, switch on values, and compose sub-workflows — deterministic every run.',
    category: 'workflows',
  },
  {
    icon: 'TimerReset',
    title: 'Retries, Pause & Resume',
    description: 'Per-step retry policies and timeouts, plus pause, resume, and cancel for long-running workflow executions.',
    category: 'workflows',
  },
  {
    icon: 'Shuffle',
    title: 'Visual Data Mapping',
    description: 'Extract with JSONPath, JMESPath, or regex, transform with expressions, and map any response into the next request visually.',
    category: 'workflows',
  },
  {
    icon: 'MessageCircleQuestion',
    title: 'Interactive Runs',
    description: 'User-input nodes prompt for values mid-run — approvals, dropdown choices, key-value forms — and feed them into runtime variables.',
    category: 'workflows',
  },
  // Extensibility
  {
    icon: 'Puzzle',
    title: 'Plugin SDK',
    description: 'A types-only SDK for building custom workflow nodes, request types, auth providers, and importers — no core changes needed.',
    category: 'extensibility',
  },
  {
    icon: 'ShieldCheck',
    title: 'Sandboxed Plugins',
    description: 'Plugin code runs in an isolated utility process with a capability broker: network, variable, and UI access require your explicit grant.',
    category: 'extensibility',
  },
  {
    icon: 'LayoutTemplate',
    title: 'Declarative Plugin UI',
    description: 'Plugins describe config forms and dialogs as data; the host renders them with trusted native UI, so plugin code never touches the DOM.',
    category: 'extensibility',
  },
  // Platform
  {
    icon: 'HardDrive',
    title: 'Offline-First Storage',
    description: 'Everything lives in a local SQLite database with migrations, transactions, and backup/restore. No account, no mandatory cloud.',
    category: 'platform',
  },
  {
    icon: 'MonitorSmartphone',
    title: 'Cross-Platform',
    description: 'One codebase for Windows, macOS, and Linux, built on Electron with a React renderer.',
    category: 'platform',
  },
  {
    icon: 'Layers',
    title: 'Workspaces',
    description: 'Multiple independent workspaces with their own projects, settings, recents, and import/export.',
    category: 'platform',
  },
  {
    icon: 'Moon',
    title: 'Light & Dark Themes',
    description: 'A polished theme system with light, dark, and system modes across every panel, editor, and dialog.',
    category: 'platform',
  },
  {
    icon: 'Shield',
    title: 'Hardened by Design',
    description: 'Context isolation, sandboxed renderer, an allowlisted IPC bridge, and Zod validation on every message crossing a process boundary.',
    category: 'platform',
  },
  {
    icon: 'DatabaseBackup',
    title: 'Backup & Restore',
    description: 'Snapshot the entire database or a single workspace and restore it later — ideal for migrating machines.',
    category: 'platform',
  },
];
