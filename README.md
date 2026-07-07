# API Workbench

A modern, Electron-based desktop application for API testing and visual workflow automation — an **offline-first Postman alternative**. API Workbench imports OpenAPI specifications and keeps collections in sync as specs evolve, executes REST / GraphQL / gRPC / WebSocket / SSE requests, manages environments and encrypted secrets, and lets you compose drag-and-drop API workflows that run deterministically. It now also ships a bring-your-own-key **AI assistant** that operates on your data, and an **app-managed MCP server** so external AI clients can author workflows against the real schema.

Everything is stored locally in SQLite. There is no account, no mandatory cloud, and no telemetry you cannot turn off.

> **Status:** Active development — 16+ delivery phases complete, currently in pre-release (`v0.1.0-alpha`). Installers are published on the [Releases](https://github.com/anandhan-j/API-Workbench/releases) page; you can also build from source in two commands (see below).

## Why API Workbench

Most API clients stop at sending requests and inspecting responses. API Workbench treats an API collection as living, versioned data that stays synchronized with its OpenAPI source, and treats multi-step API interactions as first-class, visual, executable workflows. Everything runs locally — projects, history, secrets, and versions are stored on your machine in SQLite — so there is no mandatory cloud dependency.

## Features

### API testing core
- **OpenAPI import & synchronization** — import OpenAPI 3.x and Swagger 2 (JSON/YAML, local or remote), then re-sync when the spec changes without losing manual edits. A diff engine detects added/changed/removed endpoints and merges safely.
- **Collection version control** — automatic snapshots around imports and syncs, a visual diff viewer, and one-click rollback.
- **Scoped variables & secrets** — seven variable scopes (global → workspace → collection → folder → request → workflow → runtime) with strict precedence and `{{template}}` substitution everywhere. Secret variables are encrypted with your OS keychain and decrypted only in the main process.
- **8 auth schemes** — Bearer, OAuth2 (with refresh), Basic, Digest, API Key, Cookies, AWS SigV4, and client certificates, stored once and reused across requests and workflows.
- **Tests & scripting** — status/header/body/JSON-Schema assertions plus custom JavaScript tests, and pre-request / post-response scripts in a sandbox.
- **Fast collection trees** — virtualized trees with move, copy, inline rename, favourites, history, and search that stay smooth past 10,000 requests.

### Protocols
- **REST** with streaming, multipart, uploads/downloads, retries, timeouts, redirects, and cancellation.
- **GraphQL, gRPC, WebSocket & SSE** in the runner and in workflows, including live interactive sessions for WebSocket/SSE.
- A protocol-agnostic response viewer with headers, cookies, timing, and size breakdowns.

### Workflow automation
- **Visual designer** — a React Flow canvas with drag-and-drop nodes, grouping, undo/redo, clipboard, and a mini map.
- **Deterministic runtime** — sequential/parallel execution, conditions, loops, switch, sub-workflows, per-step retries and timeouts, and pause/resume/cancel.
- **Visual data mapping** — extract with JSONPath / JMESPath / regex, transform with expressions, and map any response into the next request.
- **Interactive runs** — user-input nodes prompt for approvals, choices, and key-value forms mid-run.

### AI & MCP
- **In-app AI assistant** — a bring-your-own-key assistant that browses and edits collections, creates and updates requests (paste a cURL command and it builds the request), drafts and runs workflows, and manages non-secret variables — through the app's own service methods.
- **Bring your own key** — Anthropic Claude, OpenAI, DeepSeek, Groq, OpenRouter, or a local Ollama endpoint via one provider layer. Keys are encrypted with the OS keychain and never leave the main process; no key means no network calls.
- **Approve before it writes** — read actions run instantly, every write needs a click, and runs always confirm. Each AI edit auto-snapshots the collection first (one-click undo), and secrets are redacted before they reach the model.
- **App-managed MCP server** — expose workflow authoring over the [Model Context Protocol](https://modelcontextprotocol.io) so Claude Desktop, Cursor, Copilot, and other MCP clients build workflows against the app's generated schema and import them into your open project. Loopback-only bind, timing-safe bearer token, DNS-rebinding origin checks, and default-on TLS. Also runs standalone as [`@api-workbench/workflow-mcp`](packages/workflow-mcp).

### Extensibility & platform
- **Plugin SDK** — a types-only SDK for custom workflow nodes, request types, auth providers, and importers. Plugin code runs in an isolated utility process behind a capability broker that requires user-approved grants on every sensitive call.
- **Offline-first storage** — a local SQLite database with append-only migrations, transactions, and backup/restore.
- **Cross-platform** — one codebase for Windows, macOS, and Linux, with light/dark themes and multiple independent workspaces.
- **Hardened by design** — context isolation, sandboxed renderer, an allowlisted IPC bridge, and Zod validation on every message crossing a process boundary.

## Technology stack

Electron + React 18 + TypeScript + Vite (electron-vite) on the desktop; TailwindCSS, shadcn/ui, Radix, Lucide, and Framer Motion for UI; Zustand and React Query for state; React Router (hash routing) for routing; React Hook Form + Zod for forms; Monaco for editing; React Flow for the workflow canvas; SQLite (`better-sqlite3`) with Drizzle ORM for persistence. AI providers use the official `@anthropic-ai/sdk` plus an OpenAI-compatible adapter. Testing uses Vitest and React Testing Library (persistence runs against `sql.js`, so the suite needs no native build). See [Tech Stack](docs/architecture/TECH_STACK.md).

## Repository layout

An npm-workspaces monorepo:

| Path | Package | What it is |
| --- | --- | --- |
| `apps/desktop` | `@api-workbench/desktop` | The Electron app — main, renderer, preload, shared, and plugin-host code. |
| `packages/plugin-sdk` | `@api-workbench/plugin-sdk` | The public, types-only contract plugin authors compile against. |
| `packages/workflow-mcp` | `@api-workbench/workflow-mcp` | The standalone MCP server (stdio or Streamable HTTP). |
| `plugins/examples/` | — | One example plugin per extension point, used as integration-test fixtures. |

Inside `apps/desktop/src`, code is split by Electron process and the split is enforced: `main/` (Node — DB, network, secrets, business logic), `renderer/` (React UI, no Node access), `preload/` (the only allowlisted bridge), `shared/` (isomorphic IPC contract + Zod schemas), and `plugin-host/` (the unprivileged plugin process).

## Getting started

You need **Node.js 20+** and npm. Root scripts delegate into the desktop workspace.

```bash
git clone https://github.com/anandhan-j/API-Workbench.git
cd API-Workbench
npm install
npm run dev        # start the app with hot reload
```

Common scripts (run from the repo root):

- `npm run dev` — start the app in development (electron-vite, HMR).
- `npm run build` — typecheck, then build the production bundle.
- `npm run typecheck` — type-check **both** projects (node + web tsconfigs).
- `npm run lint` — ESLint (`--max-warnings 0`).
- `npm run format` / `npm run format:check` — Prettier across the repo.
- `npm test` — Vitest (run mode); `npm run test:coverage` for coverage.
- `npm run dist` — build production installers for your platform (`dist:win` / `dist:mac` / `dist:linux`).

> **Native module note:** persistence uses `better-sqlite3`, a native module matched to Electron's ABI. `postinstall` runs `electron-rebuild` automatically; if the app fails to start with a `NODE_MODULE_VERSION` mismatch, run `npm run rebuild:native`. Tests do not need this — they run against pure-WASM `sql.js`.

## Documentation

Design intent lives in `docs/`. Read these when a change touches architecture:

| Document | Purpose |
| --- | --- |
| [Architecture Overview](docs/architecture/ARCHITECTURE.md) | Layers, three-process model, data flow, cross-cutting concerns |
| [Tech Stack](docs/architecture/TECH_STACK.md) | Chosen technologies and why |
| [Diagrams](docs/architecture/DIAGRAMS.md) | C4 context/container/component + sequence diagrams |
| [Roadmap](docs/ROADMAP.md) | The delivery phases, deliverables, and acceptance criteria |
| [ADR Index](docs/adr/README.md) | Architecture Decision Records — incl. [0011 MCP server](docs/adr/0011-app-managed-mcp-server.md) and [0012 AI assistant](docs/adr/0012-in-app-ai-assistant.md) |

Each feature module under `apps/desktop/src/main/` also ships its own `README.md` / `Architecture.md`.

## Contributing

Issues and pull requests are welcome. Bug reports with reproduction steps and feature requests with a concrete use case are triaged fastest. No change is considered complete until its tests, documentation, typecheck, lint, and CI all pass. See the Definition of Done in the [Roadmap](docs/ROADMAP.md).

## License

MIT — see [LICENSE](LICENSE). Use it commercially, fork it, and redistribute it.
