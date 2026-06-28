# Technology Stack

This document records the chosen technologies and the reasoning behind each, so that future contributors understand not just *what* is used but *why*, and what would have to change for an alternative to be reconsidered. The selections are mandated by the project specification; the rationale here explains how each fits the architecture.

## Desktop runtime

**Electron** is the application shell. It gives a single TypeScript/web codebase across Windows, macOS, and Linux, a privileged Node main process for file system, SQLite, and network access, and a mature packaging and auto-update story. The trade-off — bundle size and memory relative to native — is acceptable for a developer tool and is mitigated by the worker-offloading strategy described in the [Architecture Overview](./ARCHITECTURE.md).

**React** drives the renderer. Its component model and ecosystem (React Flow, React Query, React Hook Form, Monaco bindings) align with every other UI choice below. **TypeScript** is used everywhere — main, preload, renderer, and all packages — to give end-to-end type safety, which is essential to the typed IPC contract that secures the process boundary. **Vite** (via electron-vite) provides fast HMR for the renderer and a coherent build pipeline for all three Electron entry points.

## User interface

**TailwindCSS** provides utility-first styling with a single design-token source feeding the light/dark theme system. **shadcn/ui** gives accessible, unstyled-by-default component recipes built on **Radix UI** primitives, which handle focus management, keyboard interaction, and ARIA correctly — important for the accessibility acceptance criteria. **Lucide** supplies a consistent icon set, and **Framer Motion** handles animation where motion communicates state (panel transitions, drag feedback) without compromising performance. These are wrapped in the `ui-kit` package so the rest of the app consumes a stable internal design system rather than third-party APIs directly.

## State management

**Zustand** holds ephemeral, renderer-local UI state (open tabs, panel sizes, selection, draft edits) — small, fast, and unopinionated, which suits transient view state. **React Query** owns server state, where "server" is the main process reached over IPC: it handles caching, invalidation, background refetching, and request de-duplication for everything that ultimately lives in SQLite. The division is deliberate and matches the data-flow model: Zustand for what the user is currently doing, React Query for what is persisted. The source of truth is always the main process.

## Routing and forms

**React Router** structures the renderer into route-level screens. **React Hook Form** manages form state with minimal re-renders, and **Zod** provides the schema validation that is reused on both sides of the IPC boundary — the same Zod schema can validate a form in the renderer and the corresponding IPC payload in the main process, eliminating drift between client and server validation.

## Editors and canvas

**Monaco Editor** powers request bodies, scripts, and expression editing, bringing real code-editor affordances (syntax highlighting, IntelliSense hooks, diff view) that a plain textarea cannot. **React Flow** is the workflow canvas: it provides the node/edge model, pan/zoom, selection, and interaction primitives that the visual workflow designer ([Phase 13](../ROADMAP.md)) builds on, while the workflow *semantics* live in the domain and runtime layers rather than in the canvas.

## Persistence

**SQLite** is the local datastore — embedded, transactional, zero-configuration, and well-suited to the local-first requirement of storing projects, collections, history, versions, and encrypted secrets on the user's machine. **Drizzle ORM** provides a typed query builder and a migration system that keeps the schema versioned and applied automatically and safely, which the persistence phase depends on for zero-data-loss upgrades. Drizzle's TypeScript-first design keeps the database layer consistent with the rest of the codebase's type discipline.

## Testing

**Vitest** is the unit and integration test runner, sharing Vite's transform pipeline for speed and config reuse. **React Testing Library** tests renderer components the way users interact with them rather than against implementation details. **Playwright** drives end-to-end tests against the packaged Electron application, exercising real flows across the process boundary. The >90% coverage gate spans unit, integration, and component layers and is enforced in CI.

## Quality tooling

ESLint and Prettier enforce a single code style; configuration is centralised in `tooling/` and extended per package. Git hooks (lint-staged on commit) prevent unformatted or lint-failing code from entering history. Turborepo orchestrates and caches `build`, `lint`, `test`, and `typecheck` across the monorepo. The CI pipeline runs the full gate on every change and is required to pass before merge.

## Version summary

| Concern | Technology |
| --- | --- |
| Shell | Electron |
| UI framework | React + TypeScript |
| Build | Vite (electron-vite) |
| Styling | TailwindCSS |
| Components | shadcn/ui + Radix UI |
| Icons | Lucide |
| Animation | Framer Motion |
| UI state | Zustand |
| Server/async state | React Query |
| Routing | React Router |
| Forms | React Hook Form + Zod |
| Editor | Monaco Editor |
| Workflow canvas | React Flow |
| Database | SQLite |
| ORM / migrations | Drizzle ORM |
| Unit/integration tests | Vitest |
| Component tests | React Testing Library |
| E2E tests | Playwright |
| Monorepo | pnpm workspaces + Turborepo |

Specific dependency versions are pinned in each package's `package.json` and the root lockfile; this table records the technology choice, not the version, because versions evolve while the rationale stays stable. Any change to a row above is a significant decision and should be accompanied by an [ADR](../adr/).
