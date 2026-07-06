# Delivery Roadmap

API Workbench is built phase-by-phase. A phase is started only after the previous one satisfies the Definition of Done below. This document is the single source of truth for what each phase delivers and how its completion is judged. It restates the specification's phases as a tracked plan and ties each to the architecture.

## Definition of Done (every phase)

A phase is complete only when **all** of the following hold: architecture decisions are documented (as ADRs where significant); the folder structure is updated; source is implemented to production quality with no TODOs, placeholders, or mock implementations remaining; interfaces and data models are finalised; unit and integration tests pass; end-to-end tests are updated where applicable; error handling, logging, and telemetry are integrated; documentation is complete; code is reviewed for performance and security; lint and formatting pass; CI passes; test coverage is above 90%; and the phase's acceptance criteria are fully satisfied.

## Phase status legend

`Planned` — not started · `In progress` · `Done`

## Phases

### Phase 1 — Project Foundation · *Done*

Stand up the monorepo, Electron + React + Vite + TypeScript shell, CI, lint, formatting, git hooks, structured logging, the renderer error boundary, the theme system, and the application layout (navigation, sidebar, tabs, status bar, settings, light/dark themes). **Acceptance:** builds successfully; runs on Windows, macOS, and Linux; CI passes; coverage above 90%.

### Phase 2 — Local Persistence Layer · *Done*

Integrate SQLite with Drizzle migrations, the repository pattern, transactions, backup and restore, workspace storage, preferences, and local caching. **Acceptance:** no data loss; rollback supported; migrations apply automatically.

### Phase 3 — Workspace Management · *Done*

Workspaces with multiple projects, open/close project, recent projects, settings, import/export workspace, and backup. **Acceptance:** multiple workspaces function independently.

### Phase 4 — Collection Management · *Done*

Collections, folders, and requests with move, copy, rename, delete, favourites, history, tree virtualization, and search. **Acceptance:** 10,000+ requests remain responsive.

### Phase 5 — OpenAPI Import Engine · *Done*

Import OpenAPI 3.x and Swagger 2 from JSON, YAML, and remote URLs, with validation, a parser, and generators for collections, folders, operations, examples, and schemas. **Acceptance:** imports large enterprise specifications successfully.

### Phase 6 — OpenAPI Synchronization Engine · *Done*

Diff engine, merge engine, conflict detection, safe merge, replace mode, incremental updates, removed-endpoint detection, and metadata preservation. **Acceptance:** manual edits remain intact after synchronization.

### Phase 7 — Collection Version Control · *Done*

Version snapshots, a diff viewer, rollback, restore, version history, change summaries, and OpenAPI checksums. **Acceptance:** any previous collection version can be restored.

### Phase 8 — Variable Engine · *Done*

Variable scopes (global, workspace, collection, folder, request, workflow, runtime), secret and encrypted variables, a variable resolver, and an expression evaluator. **Acceptance:** correct variable precedence and secure secret handling.

### Phase 9 — Authentication Framework · *Done*

Bearer, OAuth2, Basic, Digest, API Key, Cookies, AWS SigV4, and client certificates, with token refresh and credential storage. **Acceptance:** authentication is reusable across requests and environments.

### Phase 10 — Request Execution Engine · *Done*

REST execution with streaming, multipart, downloads, uploads, retries, timeouts, redirects, and cancellation, plus a response viewer (pretty JSON, XML, HTML, binary) and performance metrics. **Acceptance:** reliable execution with detailed diagnostics.

### Phase 11 — Testing & Assertions · *Done*

Assertions, JSON Schema validation, response validation, custom JavaScript tests, a test runner, and test reports. **Acceptance:** automated tests execute reliably and produce clear reports.

### Phase 12 — Workflow Engine · *Done*

Workflow model and persistence, node execution, execution context, variable propagation, and reusable components. **Acceptance:** workflows execute deterministically.

### Phase 13 — Visual Workflow Designer · *Done*

React Flow canvas with drag-and-drop, zoom, pan, grouping, selection, undo, redo, clipboard, and a mini map. **Acceptance:** smooth interaction with complex workflows.

### Phase 14 — Workflow Runtime · *Done*

Sequential and parallel execution, conditions, loops, switch, retry, timeout, error handling, resume, pause, and cancellation. **Acceptance:** the runtime supports long-running workflows reliably.

### Phase 15 — Workflow Mapping & Transformations · *Done*

JSONPath, JMESPath, regex extraction, transform expressions, visual mapping, an expression editor, and data preview. **Acceptance:** users can map outputs to subsequent requests visually.

### Phase 16 — Plugin SDK · *Done*

Plugin loader, extension API, and support for custom nodes, custom request types, custom authentication providers, and custom importers, with a marketplace-ready architecture. **Acceptance:** third-party plugins can be added without modifying the core.

### Phase 17 — Performance Optimization · *Planned*

Lazy loading, virtualization, background workers, caching, memory profiling, and large-collection support. **Acceptance:** 100,000+ requests with acceptable responsiveness.

### Phase 18 — Security & Packaging · *Planned*

Electron hardening, context isolation, IPC validation, code signing, auto-updates, secure credential storage, and crash reporting. **Acceptance:** a security audit passes and installers are produced for Windows, macOS, and Linux.

### Phase 19 — Quality Assurance · *Planned*

End-to-end, regression, performance, accessibility, and cross-platform testing. **Acceptance:** the release candidate meets the defined quality gates.

### Phase 20 — Documentation & Release · *Planned*

User Guide, Developer Guide, Architecture Guide, Plugin SDK Guide, Workflow Guide, OpenAPI Synchronization Guide, Environment Guide, Version Control Guide, Troubleshooting Guide, and Release Notes. **Acceptance:** a new developer can clone, build, understand, extend, and release the project using only the provided documentation.

## Dependency ordering

The phases form a deliberate chain. Foundation (1) and persistence (2–3) underpin everything. Collections (4) are the substrate that import (5), synchronization (6), and versioning (7) operate on. Variables (8) and authentication (9) are prerequisites for meaningful request execution (10), which in turn enables testing (11). The workflow stack (12–15) builds on execution. The plugin SDK (16) generalises the extension points exposed by earlier phases. Performance (17), security/packaging (18), QA (19), and documentation/release (20) harden and ship what precedes them. This ordering is why the methodology forbids jumping ahead: each phase consumes guarantees the prior phases established.
