export type PhaseStatus = 'completed' | 'in-progress' | 'planned' | 'future';

export interface RoadmapPhase {
  phase: number;
  title: string;
  status: PhaseStatus;
  summary: string;
  acceptance: string;
}

/** Mirrors docs/ROADMAP.md in the repository. */
export const roadmap: RoadmapPhase[] = [
  { phase: 1, title: 'Project Foundation', status: 'completed', summary: 'Monorepo, Electron + React + Vite + TypeScript shell, CI, theming, and the application layout.', acceptance: 'Builds and runs on Windows, macOS, and Linux with CI green.' },
  { phase: 2, title: 'Local Persistence Layer', status: 'completed', summary: 'SQLite with Drizzle migrations, repositories, transactions, and backup & restore.', acceptance: 'No data loss; migrations apply automatically; rollback supported.' },
  { phase: 3, title: 'Workspace Management', status: 'completed', summary: 'Multiple workspaces and projects with settings, recents, and import/export.', acceptance: 'Multiple workspaces function independently.' },
  { phase: 4, title: 'Collection Management', status: 'completed', summary: 'Collections, folders, and requests with move/copy/rename, favourites, history, and virtualized search.', acceptance: '10,000+ requests remain responsive.' },
  { phase: 5, title: 'OpenAPI Import Engine', status: 'completed', summary: 'OpenAPI 3.x and Swagger 2 import from JSON, YAML, and URLs with full generators.', acceptance: 'Imports large enterprise specifications successfully.' },
  { phase: 6, title: 'OpenAPI Synchronization', status: 'completed', summary: 'Diff + merge engines with conflict detection, safe merge, and removed-endpoint detection.', acceptance: 'Manual edits remain intact after synchronization.' },
  { phase: 7, title: 'Collection Version Control', status: 'completed', summary: 'Snapshots, diff viewer, rollback, restore, and change summaries.', acceptance: 'Any previous collection version can be restored.' },
  { phase: 8, title: 'Variable Engine', status: 'completed', summary: 'Seven variable scopes, secret encryption, resolver, and expression evaluation.', acceptance: 'Correct precedence and secure secret handling.' },
  { phase: 9, title: 'Authentication Framework', status: 'completed', summary: 'Bearer, OAuth2, Basic, Digest, API Key, Cookies, AWS SigV4, and client certificates.', acceptance: 'Auth is reusable across requests and environments.' },
  { phase: 10, title: 'Request Execution Engine', status: 'completed', summary: 'REST execution with streaming, multipart, retries, cancellation, and a rich response viewer.', acceptance: 'Reliable execution with detailed diagnostics.' },
  { phase: 11, title: 'Testing & Assertions', status: 'completed', summary: 'Assertions, JSON Schema validation, custom JS tests, runner, and reports.', acceptance: 'Automated tests execute reliably with clear reports.' },
  { phase: 12, title: 'Workflow Engine', status: 'completed', summary: 'Workflow model, node execution, execution context, and variable propagation.', acceptance: 'Workflows execute deterministically.' },
  { phase: 13, title: 'Visual Workflow Designer', status: 'completed', summary: 'React Flow canvas with drag-and-drop, undo/redo, clipboard, grouping, and mini map.', acceptance: 'Smooth interaction with complex workflows.' },
  { phase: 14, title: 'Workflow Runtime', status: 'completed', summary: 'Sequential/parallel execution, conditions, loops, retry, timeout, pause/resume/cancel.', acceptance: 'Long-running workflows are reliable.' },
  { phase: 15, title: 'Mapping & Transformations', status: 'completed', summary: 'JSONPath, JMESPath, regex extraction, transform expressions, and visual mapping.', acceptance: 'Outputs map to subsequent requests visually.' },
  { phase: 16, title: 'Plugin SDK', status: 'completed', summary: 'Plugin loader, sandboxed host, capability broker, and four extension points.', acceptance: 'Third-party plugins work without modifying the core.' },
  { phase: 17, title: 'Performance Optimization', status: 'in-progress', summary: 'Lazy loading, virtualization, background workers, caching, and memory profiling.', acceptance: '100,000+ requests with acceptable responsiveness.' },
  { phase: 18, title: 'Security & Packaging', status: 'planned', summary: 'Electron hardening audit, code signing, auto-updates, and installers.', acceptance: 'Security audit passes; installers ship for all three platforms.' },
  { phase: 19, title: 'Quality Assurance', status: 'planned', summary: 'End-to-end, regression, performance, accessibility, and cross-platform testing.', acceptance: 'Release candidate meets the quality gates.' },
  { phase: 20, title: 'Documentation & Release', status: 'future', summary: 'User, developer, architecture, plugin, and workflow guides plus release notes.', acceptance: 'A new developer can clone, build, extend, and release from the docs alone.' },
];
