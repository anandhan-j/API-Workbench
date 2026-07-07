# ADR-0011: App-managed MCP server as a spawned child over loopback Streamable HTTP

- **Status:** Accepted
- **Date:** 2026-07-07
- **Related:** ADR-0001, ADR-0003, ADR-0005, ADR-0010

## Context

AI coding assistants (Claude, Copilot, Cursor, and other MCP clients) can author API Workbench workflows if they are given the workflow schema, examples, validation, and a way to hand a finished workflow back to the app. The [Model Context Protocol](https://modelcontextprotocol.io) is the emerging standard for exactly this — a client connects to a server that exposes *resources* (read-only context), *tools* (model-invoked actions), and *prompts* (user-invoked templates).

We had to decide where that server lives and how it talks to both the assistant and the app. Two forces pull in opposite directions:

- The server must be usable **standalone** — a developer running `npx workflow-mcp` over stdio should get schema, examples, validation, and file output without the desktop app running at all. That argues for a self-contained package with no app dependency.
- When the app *is* running, the server should be able to import a completed workflow **directly into the open project** — a materially better experience than writing a file the user then imports by hand. That argues for a live channel into privileged app state.

The app also stores secrets and executes arbitrary user requests (ADR-0003), so any server it exposes on the machine is part of the attack surface: a localhost HTTP listener is reachable by any process on the box and by any web page the user visits (via DNS-rebinding). The design has to hold up under that.

## Decision

We ship the MCP server as a **standalone, transport-agnostic package** (`@api-workbench/workflow-mcp`) and the desktop app **spawns and manages it as a child process** in Streamable HTTP mode. The two concerns are kept separate on purpose — the package knows nothing about Electron, and the app-side manager knows nothing about MCP wire details.

**Package (`packages/workflow-mcp`).** A per-session `McpServer` built with the official SDK, exposing:

- *Resources* — `workflow://schema`, `workflow://schema/graph`, and templated `workflow://examples/{name}`.
- *Tools* — `get_workflow_schema`, `validate_workflow`, `generate_workflow`, `add_or_update_workflow`, and `import_workflow_to_app`.
- *Prompt* — `create_workflow_from_description`.

It runs under two transports from one entrypoint: **stdio** (default; stdout *is* the JSON-RPC channel, diagnostics go to stderr) and **Streamable HTTP** (`--http`; prints one machine-readable `WORKFLOW_MCP_LISTENING <url>` line for a parent to capture). The workflow JSON Schema it validates against is **generated from the app's Zod domain model** (ADR-0005) by a committed build step, so the schema the assistant sees cannot drift from what the app accepts.

**App integration (`apps/desktop/src/main/mcp`).** An `McpServerManager` owns the child's lifecycle — start/stop, a ready handshake with timeout, port-conflict retry, sticky auto-port, a persisted static bearer token, and status reporting. It is deliberately **Electron-free and child-process-free**: the actual spawn is an injected `SpawnMcpChild` port, which is what keeps the whole lifecycle unit-testable against a fake child. Start/stop is **user-initiated from Settings** — the server is never auto-started at boot. State reaches the UI through the typed IPC contract (`mcp.*` channels plus a `mcp.statusChanged` push event), consistent with ADR-0003.

**Back-channel for in-app import.** When the child runs in HTTP mode its stdout is free (JSON-RPC is on the socket), so the app→child pipe carries a small newline-delimited JSON RPC: the child calls `importWorkflow`, the app validates the bundle against the shared `WorkflowExport` schema, imports it as a **new** workflow (fresh ids, non-destructive) into the active project, and pushes `workflows.changed` so the renderer refreshes. This reuses the existing stdio pipe — **no second network port** — and is only available in app-managed mode (`import_workflow_to_app` degrades to "use `add_or_update_workflow`" under standalone stdio).

**Security model — three always-on protections in HTTP mode:**

1. **Loopback-only bind** (`127.0.0.1`), never a routable interface.
2. **Bearer token** on every request (query `?token=` or `Authorization: Bearer`), compared timing-safe; missing/invalid → 401. The token is persisted so the connect URL is stable, rotated only on explicit refresh, and **redacted in every log** — it is surfaced un-redacted only to the user in the Settings UI.
3. **Origin validation** (DNS-rebinding defense): no-Origin (native clients) or loopback origins only; a real web origin → 403.

Plus resource caps (`MAX_SESSIONS = 64`, 4 MiB initialize body), and **orphan prevention** — the child treats its stdin closing as parent-death and exits, so an ungraceful app crash never leaves a loopback server running. **TLS is default-on**: the main process generates an ephemeral self-signed cert and passes the PEM to the child via env vars, so **the private key never touches disk**.

## Alternatives considered

**Embed the server in-process (no child).** Simpler wiring, but it couples the server's lifecycle and any transport bug to the privileged main process, and forfeits the standalone `npx` use case entirely. Spawning a child gives crash isolation and one artifact that serves both modes — the same reasoning that put plugins in a separate process (ADR-0010).

**A dedicated back-channel socket instead of the stdio pipe.** A second listener is a second thing to secure, bind, and tear down. Reusing the pipe the app already reads is strictly less surface and inherits the parent-death signal for free.

**Write-file-only (no in-app import).** This is the standalone behavior and it works, but when the app is open, making the user re-import a file the assistant just produced is friction we can remove safely because the import is validated and non-destructive.

**Plain HTTP by default.** Rejected: a bearer token in a URL over plain loopback HTTP is still readable to anything that can see the traffic. Default-on TLS closes that; the UI notes some clients reject self-signed certs and lets the user opt down to HTTP.

## Consequences

Assistants get a first-class, schema-accurate path to author workflows either standalone or straight into the open project, behind a loopback + token + Origin + TLS boundary that matches the app's existing security posture. The costs: one more bundle/publish target (`@api-workbench/workflow-mcp`) and its schema-generation build step, which is now a drift risk guarded by tests; a child process to supervise with its own failure and port-conflict modes; and a small bespoke RPC over stdio that both sides must keep in sync. The workflow JSON Schema is now a semi-public contract — assistants depend on it — so it must evolve compatibly with the Zod model it is generated from.
