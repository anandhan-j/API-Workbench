# @api-workbench/workflow-mcp

An [MCP](https://modelcontextprotocol.io) server for authoring **API Workbench workflow
JSON**. It gives any MCP-capable AI client (Claude Desktop, VS Code Copilot, Cursor,
Codex) the app's exact workflow schema plus an Ajv validator that returns
self-correcting error messages — so the model produces `.workflow.json` files that import
cleanly into API Workbench.

> Status: **early / in development.** Phase 0 (runnable stdio server) is in place;
> resources, validation, and generation tools land in subsequent phases. See
> [docs/plans/workflow-mcp-server.md](../../docs/plans/workflow-mcp-server.md).

## What it will expose

- **Resources** — `workflow://schema` (the JSON Schema) and `workflow://examples/{name}`
  (example workflow library).
- **Tools** — `get_workflow_schema`, `validate_workflow` (Ajv + actionable errors),
  `generate_workflow`, `add_or_update_workflow` (write a `.workflow.json` to disk), and
  `import_workflow_to_app` (import straight into the running API Workbench app).
- **Prompt** — "Create workflow from description."

### `import_workflow_to_app` (app-managed mode only)

When the desktop app launches this server as its managed child, `import_workflow_to_app`
imports a validated workflow **directly into the running app**, where it appears in the
workflow list immediately — no manual file import. It reuses the app's own import path, so
the workflow is added as a **new** workflow (fresh ids) in the active project; this is
additive and non-destructive. The app talks to the child over the stdio the app already
reads (no extra network port). In standalone/`npx` mode the back-channel is absent and the
tool says so — use `add_or_update_workflow` to write a file instead.

### `add_or_update_workflow` and the overwrite rule

`add_or_update_workflow` validates a workflow bundle and writes it to a `.workflow.json`
file. Creating a **new** file is unconditional. **Updating (overwriting) an existing file
always requires user confirmation** — this is enforced, not advisory:

- Clients that support **elicitation** get an interactive prompt showing the file path and
  a before→after summary (name, id, node/edge counts); the file is overwritten only if the
  user accepts.
- Clients that can't prompt must pass `confirmUpdate: true` (after the user confirms) — the
  tool refuses to overwrite otherwise. Either way an update never happens silently.

## Run locally (development)

```sh
npm run build --workspace @api-workbench/workflow-mcp
node packages/workflow-mcp/dist/index.js   # speaks MCP over stdio
```

Inspect it with the MCP Inspector:

```sh
npx @modelcontextprotocol/inspector node packages/workflow-mcp/dist/index.js
```

## Install (once published)

```sh
npx -y @api-workbench/workflow-mcp
```

Client configuration blocks (Claude Desktop, VS Code, Cursor, Codex) and a one-click
Claude Desktop `.mcpb` extension will be documented here at first publish.

## Notes

- The server is **decoupled from the Electron app**: for pure workflow generation it
  needs only the bundled schema + validator, no running app.
- stdout carries JSON-RPC — all logging goes to stderr.
