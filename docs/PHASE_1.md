# Phase 1 — Project Foundation

This document records what the Phase 1 milestone delivers, the decisions taken, and its acceptance status. Phase 1 establishes the application shell that every later phase builds on.

## Delivered

The monorepo is set up with npm workspaces, a shared base TypeScript configuration, Prettier, ESLint, and a `.gitignore`. The desktop application under `apps/desktop` is an Electron + React + TypeScript app built with electron-vite, split along the process boundary into `main` (privileged lifecycle, window, IPC handlers, logging), `preload` (the context-bridge exposing an allowlisted, typed API), `renderer` (the sandboxed React UI), and `shared` (the single typed IPC contract).

The application shell provides the full chrome called for in Phase 1: a collapsible sidebar with navigation, a tab bar synchronised with the router, routed content (Home, Dispatch Monitor, Settings), a status bar showing connection state, runtime versions, a live event counter and a theme toggle, and a light/dark theme system driven by CSS design tokens and a Zustand store. A top-level React error boundary degrades render faults gracefully and reports them to the unified log.

"Dispatch monitoring" is implemented as in-app observability: a structured logger in the main process buffers and emits dispatch/log events, the IPC layer streams them to the renderer, and a docked Dispatch Monitor panel renders the live stream with level filtering, pause, and clear. This satisfies Phase 1's logging deliverable and adds the requested dispatch-monitoring surface.

Security follows [ADR-0003](./adr/0003-electron-security-and-ipc.md): context isolation on, node integration off, sandbox on, a strict CSP on the renderer, blocked in-app navigation and window creation, and an IPC contract where every payload is Zod-validated on the main side and the preload exposes only an enumerated allowlist of channels.

## Tests and verification

The suite covers the IPC contract schemas, the dispatch logger (buffering, emission, ring-buffer bound, secret redaction), the UI and dispatch Zustand stores, the renderer IPC client and its no-bridge fallback, and the Dispatch Monitor component (rendering, level filtering, pause). All 27 tests across 6 files pass, and the renderer/shared TypeScript project type-checks cleanly.

Verification was run on a headless Linux environment, which can install dependencies, type-check, and run the Vitest suite, but cannot launch the Electron GUI window. The full Electron build (`electron-vite build`) and the running application window are exercised on a developer workstation per the [Getting Started](./guides/GETTING_STARTED.md) guide.

## Key decision: single app now, package extraction later

The [Architecture Overview](./architecture/ARCHITECTURE.md) describes the target as a set of layered packages (`domain`, `application`, `infrastructure`, `shared`, and feature modules). Phase 1 intentionally ships the layered structure *inside* the `apps/desktop` app (under `src/main`, `src/preload`, `src/renderer`, `src/shared`) rather than as separate published packages. This keeps the foundation simple and fully buildable while preserving the boundaries and dependency direction. As features arrive in later phases (collections, OpenAPI, variables, execution, workflows), the stable, reusable layers are extracted into `packages/*` workspaces without changing the architecture. The monorepo workspace configuration is already in place to absorb them.

## Acceptance criteria

The Phase 1 specification requires: builds successfully; runs on Windows, macOS, and Linux; CI passes; 90%+ test coverage. Status against each: the renderer/shared type-check and the Vitest suite pass in the sandbox, and the app is structured to build and run cross-platform via electron-vite. The remaining items to close the phase on a workstation are: run the full `electron-vite build` and launch on each target OS, wire the CI pipeline to run the lint/typecheck/test gates, and confirm coverage meets the 90% threshold (the current tests target the core logic; UI breadth is extended to reach the gate). These are workstation/CI tasks rather than code changes.

## Next

Phase 2 (Local Persistence Layer) introduces SQLite via Drizzle behind repository ports, with migrations, transactions, and backup/restore — see the [Roadmap](./ROADMAP.md).
