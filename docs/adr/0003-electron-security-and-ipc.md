# ADR-0003: Electron security model and typed IPC contract

- **Status:** Accepted
- **Date:** 2026-06-27
- **Related:** ADR-0001, ADR-0006

## Context

API Workbench executes arbitrary user-defined HTTP requests, runs user-authored JavaScript test code, loads third-party plugins, and stores secrets. The renderer therefore handles untrusted and attacker-influenceable content (response bodies, imported specs, plugin code). Electron's default-insecure configurations — `nodeIntegration` enabled, `contextIsolation` disabled, unconstrained `ipcMain` handlers — would let any cross-site-scripting or malicious-content foothold in the renderer reach Node, the file system, the database, and the OS. The product's security acceptance criteria (Phase 18) require a hardened configuration and validated IPC.

## Decision

We will run the renderer with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`, and expose capabilities exclusively through a `contextBridge` preload that enumerates a fixed allowlist of IPC channels — there is no generic "invoke arbitrary main method" bridge. Every IPC channel is defined once in the `shared` package as a named channel with a Zod schema for its request and response. The main process validates every inbound payload against its schema before any handler executes; validation failures are rejected and logged. The same Zod schemas are reused for renderer-side form validation, so client and server validation cannot drift. A strict Content-Security-Policy is applied to the renderer, and navigation and new-window creation are blocked by default.

## Alternatives considered

**`nodeIntegration: true` for developer convenience** was rejected outright as incompatible with executing untrusted content. **An untyped `ipcRenderer.invoke` passthrough** was rejected because it offers no boundary validation and no compile-time contract, making the process split security-theatre. **Validating only at the handler, without a shared schema** was rejected because it permits drift between what the renderer sends and what the main process expects, and duplicates validation logic. **Exposing the full Node API behind a single bridge method** defeats the purpose of context isolation and was rejected.

## Consequences

The renderer can only do what the enumerated channels permit, and every crossing of the boundary is schema-validated, giving end-to-end type safety and a hard security barrier. Adding a capability is a deliberate act: define a channel and its schema, implement and register the handler. The cost is that contributors cannot quickly "just call Node from the UI" — every interaction is mediated — which is precisely the constraint we want. This model is the enforcement point for the secret-handling rules in ADR-0006 and the plugin constraints in ADR-0007.
