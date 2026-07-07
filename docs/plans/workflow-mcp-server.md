# Plan — Workflow MCP Server (`@api-workbench/workflow-mcp`)

A standalone TypeScript MCP server that lets any AI client (Claude Desktop, VS Code
Copilot, Cursor, Codex) author **API Workbench workflow JSON** that is guaranteed to
match the app's own workflow schema. It shares the app's TypeScript workflow types,
exposes the JSON Schema + example library as MCP resources, and — the killer feature —
validates candidate workflows with Ajv and returns actionable, self-correcting errors.

Status: **In progress** — Phases 0–4 done (functional server complete); Phase 5
(distribution) and Phase 6 (live app state, deferred) remain. This is a new deliverable
outside the 1–20 product roadmap; it can ship independently of the desktop app's release
train.

### Progress

| Phase | Deliverable | Status |
|------|-------------|--------|
| 0 | Package scaffold (runnable stdio handshake) | ✅ Done |
| 1 | Zod→JSON Schema generation pipeline + drift guard | ✅ Done |
| 2 | `workflow://schema` + `workflow://examples/{name}` resources | ✅ Done |
| 3 | `get_workflow_schema` + `validate_workflow` (self-correcting errors) | ✅ Done |
| 4 | `generate_workflow` + "create workflow from description" prompt | ✅ Done |
| 5 | Publish + 4 client configs + `.mcpb` | ⬜ Not started |
| 6 | Live app state via local HTTP endpoint | ⬜ Deferred (only when needed) |
| 7 | Run the server from the app (HTTP mode, port/URL/copy UI) | ✅ Done |

**Phase 7 — app-managed server (added).** The package gained a **Streamable HTTP
transport** mode (`workflow-mcp --http --port <n> --token <t>`), bound to `127.0.0.1`
with a bearer-token gate and `Origin` validation (stdio remains the default). It also
supports **HTTPS/TLS** — cert/key via env (PEM, so the key never hits disk) or
`--tls-cert`/`--tls-key`; the app generates an ephemeral self-signed cert (`selfsigned`)
in the main process and passes it to the child over env. A Settings toggle (default on)
switches HTTP↔HTTPS, with an in-UI note that some clients reject self-signed certs. The
desktop
app spawns it as a managed child process ([main/mcp/](../../apps/desktop/src/main/mcp/)):
an Electron-free `McpServerManager` (injected spawn seam, unit-tested) plus a thin
`spawnMcpChild` that forks the bundled entry via Electron-as-Node and reads its
`WORKFLOW_MCP_LISTENING` line. Wired through the IPC contract (`mcp.getStatus/start/stop/
setPort` + `mcp.statusChanged` push), the port persisted as `PREF_MCP_PORT`, and a
Settings → Integrations panel with port, Start/Stop, live status, the running URL, and
copy buttons. Verified end-to-end with a real-child integration test (spawns the built
package, confirms a live token-gated endpoint). **Follow-up:** production `asarUnpack`
covers the current dependency closure but a packaged installer should be smoke-tested.

**What shipped in 0–4** (all under [packages/workflow-mcp/](../../packages/workflow-mcp/)):
the ESM package (`@api-workbench/workflow-mcp`, `bin: workflow-mcp`); a schema emitter in
the desktop workspace ([scripts/emit-workflow-schema.mjs](../../apps/desktop/scripts/emit-workflow-schema.mjs))
with a drift-guard test; the two schema resources + a three-example canonical library
(`hello-world`, `auth-flow`, `full-feature`); the `get_workflow_schema` and
`validate_workflow` tools (Ajv with an arm-pruning reducer that collapses ~170 union
errors to the one real mistake, returned as `isError`); and `generate_workflow` + the
authoring prompt. 15 package tests + desktop guard tests (drift + example validation)
pass; the server is verified end-to-end over a live MCP client session.

---

## Goals & non-goals

**Goals**
- One `npx`-installable stdio MCP server, zero global install, no app running required
  for the core "generate a workflow file" use case.
- The schema the server validates against is **derived from `@shared/workflow` Zod
  schemas**, not hand-copied — so it never drifts from the app.
- On validation failure, return `isError: true` (a *tool-execution* error, not a
  JSON-RPC protocol error) with exact Ajv `instancePath` + expected values, so the model
  self-corrects on the next turn.
- Ship copy-paste config for all four clients + a one-click Claude Desktop `.mcpb`.

**Non-goals (v1)**
- No live app state (existing workflows, available endpoints). Deferred to Phase 6,
  behind a tiny optional local HTTP endpoint, and only if we actually need it.
- No write-to-running-app round trip in v1 (also Phase 6).
- No remote/Streamable-HTTP transport — stdio only.

---

## Grounding: what already exists in the repo

Established by exploration — the plan builds on these, does not re-derive them:

- **Source of truth for workflow shape:** `apps/desktop/src/shared/workflow.ts` — pure
  Zod schemas with inferred types. Key exports: `WorkflowGraph` (`{ nodes, edges,
  groups }`), `WorkflowNode` (union of `BuiltinWorkflowNode` discriminated on `kind` +
  `PluginWorkflowNode`), `WorkflowEdge`, `WorkflowExport` (the `.workflow.json` bundle
  format, `formatVersion: 1`), and the per-kind config schemas.
- **Node kinds:** `start, request, set-variable, delay, sub-workflow, condition, switch,
  loop, transform, user-input, end` (`WorkflowNodeKind` enum). Two opaque `z.unknown()`
  spots: `RequestNodeConfig.payload` and `PluginWorkflowNode.config`.
- **Dependency schemas** `workflow.ts` pulls in: `protocol.ts`, `auth.ts`,
  `execution.ts`, `condition.ts`, `extract.ts`, `forms.ts` (all under `shared/`).
- **No Zod→JSON Schema generation exists yet** — greenfield. `zod-to-json-schema` is not
  a dependency.
- **Ajv is already used** in `apps/desktop/src/main/testing/schema-validator.ts`
  (`new Ajv({ allErrors: true, strict: false })`) — mirror those options.
- **Example library, ready-made:** `examples/full-feature-workflow.workflow.json`
  (exercises every node kind) and `examples/runtime-input-demo.workflow.json`.
- **Packaging model to copy:** `packages/plugin-sdk/` — standalone monorepo package with
  `prepare` build script, `files: ["dist"]`, committed `dist/`, registered via root
  `workspaces: ["apps/*", "packages/*"]`.

**Key architectural decision — how the server gets the schema.** Two options:

1. **Import the Zod schemas** from the shared module at build time and run
   `zod-to-json-schema` to produce a static `workflow.schema.json` baked into the
   package. Preferred: keeps the server decoupled (no runtime dep on app internals) yet
   the schema is generated, not copied, so it can't drift.
2. Hand-mirror types (what plugin-sdk does). Rejected for the schema — we want generated.

We take option 1: a **build step in the desktop workspace emits the JSON Schema**, and
the MCP package consumes that generated artifact. See Phase 1.

---

## Package identity

- npm name: `@api-workbench/workflow-mcp` (scoped, published public) — `npx` form
  `npx -y @api-workbench/workflow-mcp`. If unscoped is preferred for shorter config,
  fall back to `api-workbench-workflow-mcp`.
- `bin`: `workflow-mcp` → `dist/index.js` (shebang `#!/usr/bin/env node`).
- Location in monorepo: `packages/workflow-mcp/`.
- Runtime deps: `@modelcontextprotocol/sdk`, `ajv`, `ajv-formats`, `zod`. Dev:
  `typescript`, `zod-to-json-schema`, `@types/node`, the `mcpb` CLI (for `.mcpb`).

---

## Phase 0 — Scaffold the package · *~0.5 day* · ✅ Done

**Deliver:** an empty-but-runnable package skeleton mirroring `packages/plugin-sdk/`.

- Create `packages/workflow-mcp/` with `package.json` (name, `bin`, `type: "module"`
  or CJS to match SDK conventions — check what `@modelcontextprotocol/sdk` needs; the
  SDK is ESM-first, so use ESM), `tsconfig.json` (extend the pattern from plugin-sdk:
  `declaration`, `outDir: dist`, `rootDir: src`, `strict`, `skipLibCheck`).
- Add to root `package.json` scripts if a delegated `build:mcp` / `test` hook is wanted;
  it is already covered by the `packages/*` workspace glob.
- `src/index.ts` with a minimal `McpServer` + `StdioServerTransport` that starts and
  logs to **stderr only** (stdout is the JSON-RPC channel — never `console.log` to it).
- Add `README.md` stub.

**Acceptance:** `npm run build --workspace @api-workbench/workflow-mcp` produces `dist/`,
and `node packages/workflow-mcp/dist/index.js` starts and responds to an MCP
`initialize` handshake (test with `@modelcontextprotocol/inspector`).

---

## Phase 1 — Schema generation pipeline · *~1 day* · ✅ Done

**Deliver:** a generated `workflow.schema.json` the server validates against, produced
from the app's Zod, wired so it can't drift.

- Add a script in the **desktop workspace** (e.g. `apps/desktop/scripts/emit-workflow-schema.ts`)
  that imports `WorkflowExport` (and/or `WorkflowGraph`) from `@shared/workflow`, runs
  `zodToJsonSchema(WorkflowExport, { name: 'WorkflowExport', ... })`, and writes JSON.
  - Decide the validated root: **`WorkflowExport`** (the full `.workflow.json` bundle) is
    the right target since that's what users save/import. Also emit `WorkflowGraph`
    separately for callers who want just a graph.
  - Handle the two `z.unknown()` spots — they become `{}`/any; document that
    `request.payload` and `plugin:*` node `config` are intentionally unconstrained.
- The MCP package's build **copies/generates** the schema into
  `packages/workflow-mcp/src/generated/workflow.schema.json`. Options: a root script
  `npm run build:mcp-schema` that runs the emitter and copies output, run as a `prepare`
  / prebuild step. Commit the generated file (like plugin-sdk commits `dist/`) so `npx`
  users get it without a build.
- Add a **drift guard test**: a Vitest that regenerates the schema in-memory and asserts
  it equals the committed file — fails CI if someone edits `workflow.ts` without
  regenerating. (Mirrors the "schema is the spine, can't drift" ethos in CLAUDE.md.)

**Acceptance:** editing a node config in `shared/workflow.ts` and running the emitter
updates `workflow.schema.json`; the drift test fails until the committed copy is
refreshed.

---

## Phase 2 — Resources · *~0.5 day* · ✅ Done

**Deliver:** the schema and example library as MCP resources.

- `workflow://schema` — returns the generated JSON Schema (mimeType
  `application/schema+json`).
- `workflow://examples/{name}` — **resource template** (RFC 6570). Back it by bundling
  the two `examples/*.workflow.json` files into the package (copy at build time into
  `src/generated/examples/`). `{name}` ∈ `full-feature`, `runtime-input`. Also implement
  `resources/list` so clients that enumerate can discover them.
- Optionally `workflow://examples` (index listing available example names).

**Acceptance:** MCP Inspector lists the resources; reading `workflow://schema` returns
valid JSON Schema; reading `workflow://examples/full-feature` returns the bundle.

---

## Phase 3 — Tools: `get_workflow_schema` + `validate_workflow` · *~1.5 days* · ✅ Done

**Deliver:** the two core tools. Tools are the universally-supported primitive, so the
schema is reachable even on clients that don't surface resources.

- **`get_workflow_schema`** — no input (or optional `{ root?: 'export' | 'graph' }`).
  Returns the JSON Schema as text. Lets resource-less clients pull the spec.
- **`validate_workflow`** — input `{ workflow: object | string }` (accept a JSON string
  or parsed object; if string, parse and on parse error return `isError` with the syntax
  error). Runs Ajv (`allErrors: true, strict: false`, `ajv-formats` for `uri`/`date-time`)
  against the schema.
  - **On success:** normal result, `{ valid: true }`, optionally echo a normalized copy.
  - **On failure:** `isError: true` with a message built from `ajv.errors` — for each
    error emit `instancePath`, `message`, `params` (e.g. `allowedValues`), and the
    schema keyword. Format as actionable lines, e.g.
    `nodes[2].kind must be one of [start, request, ...]; got "fetch"`. Return the raw
    `errors` array too for programmatic clients.
  - Author the tool `inputSchema` with **Zod** (SDK converts via Standard Schema).

**Design note (from MCP guidance):** protocol-level JSON-RPC errors are swallowed by the
client and hidden from the model; only `isError: true` tool results are fed back into
context. So validation failures **must** be `isError` results, never thrown protocol
errors. This is the whole point of the server.

**Acceptance:** feeding a workflow with a bad enum value returns `isError: true` and the
message names the exact path and allowed values; a valid full-feature workflow validates
clean.

---

## Phase 4 — Tool: `generate_workflow` + Prompt · *~1.5 days* · ✅ Done

**Deliver:** assisted generation and a user-facing prompt template.

- **`generate_workflow`** — input is a **structured spec** (a friendlier, higher-level
  Zod schema than the raw graph — e.g. an ordered list of step specs the tool lowers
  into nodes+edges with generated ids and auto-layout positions). Steps:
  1. Assemble the `WorkflowExport` JSON from the spec (generate `id`s deterministically —
     no `Math.random`; derive from index/name so runs are reproducible; auto-position
     nodes on a grid).
  2. **Validate** the assembled JSON with the same Ajv path as Phase 3; if invalid,
     return `isError` (should not happen if the assembler is correct — it's a safety net).
  3. Return the finished `.workflow.json` text.
  - Optional inputs: `writeToDisk?: { path }` (write the file, guarded — only if the MCP
    process has fs access and the path is provided) — keep this opt-in and off by default.
    App hand-off is deferred to Phase 6.
- **Prompt** `create_workflow_from_description` — a user-invoked template that seeds the
  model: includes the schema (or instructs it to read `workflow://schema` /
  `get_workflow_schema`), an example, and asks it to produce a spec then call
  `generate_workflow`/`validate_workflow`.

**Acceptance:** a plain-language description → `generate_workflow` yields a JSON bundle
that passes `validate_workflow` and imports cleanly into the app.

---

## Phase 5 — Distribution & client config · *~1 day*

**Deliver:** publishable package + copy-paste config for all four clients + `.mcpb`.

- Keep **tool count small** (`get_workflow_schema`, `validate_workflow`,
  `generate_workflow`) — Cursor caps active tools at 40 across all servers; a lean
  surface avoids silent tool loss.
- `README.md` with the four config blocks:

  **Claude Desktop** (`claude_desktop_config.json`, key `mcpServers`; Windows path
  `%APPDATA%\Claude\` — note the MSIX "Edit Config opens the wrong file" bug, real path
  under `%LOCALAPPDATA%\Packages\Claude...\LocalCache\Roaming\Claude\`):
  ```json
  { "mcpServers": { "workflow-builder": { "command": "npx", "args": ["-y", "@api-workbench/workflow-mcp"] } } }
  ```
  **VS Code** (`.vscode/mcp.json`, key **`servers`** — not `mcpServers`; Agent mode only):
  ```json
  { "servers": { "workflow-builder": { "command": "npx", "args": ["-y", "@api-workbench/workflow-mcp"] } } }
  ```
  **Cursor** (`.cursor/mcp.json` or `~/.cursor/mcp.json`, key `mcpServers`):
  ```json
  { "mcpServers": { "workflow-builder": { "command": "npx", "args": ["-y", "@api-workbench/workflow-mcp"] } } }
  ```
  **Codex** (`~/.codex/config.toml`):
  ```toml
  [mcp_servers.workflow-builder]
  command = "npx"
  args = ["-y", "@api-workbench/workflow-mcp"]
  ```
- **Claude Desktop `.mcpb`** one-click extension: add `manifest.json`, bundle the built
  server + Node deps, `mcpb pack`. Ship the `.mcpb` as a GitHub release asset.
- Publish to npm (`files: ["dist", "src/generated"]` allowlist, `prepare` builds).
  Set up a release workflow (align with the existing `.github/workflows/`).

**Acceptance:** a fresh machine with each client, given only the config block, spawns the
server and shows the tools/hammer indicator; the `.mcpb` installs in one click.

---

## Phase 6 — (Optional, deferred) Live app state · *only when needed*

Do **not** build until there's a real need for state-awareness or round-trip import.

- Expose a tiny **local HTTP endpoint from the Electron backend** (loopback, auth token)
  serving read-only app state: existing workflow ids/names, available request endpoints,
  credential ids. Keep it out of the MCP server process — the server just `fetch`es it
  when `--app-url` / an env var is set, and degrades to pure-generation mode when absent.
- Add tools like `list_existing_workflows`, `import_workflow_to_app` that call this
  endpoint. `generate_workflow`'s `writeToDisk`/hand-off graduates here.
- Keeps the MCP server **decoupled from the Electron process** (per Electron guidance:
  don't fork/spawn a second app instance) — HTTP is the only coupling.

**Acceptance:** with the app running, the server can enumerate real workflows and push a
generated one into the app; with the app closed, all Phase 1–4 tools still work.

---

## Cross-cutting concerns

- **stdout is sacred.** All logging → stderr. A stray `console.log` corrupts the
  JSON-RPC stream and breaks every client.
- **Determinism.** No `Math.random` / wall-clock in id or position generation — derive
  from input so `generate_workflow` is reproducible and testable.
- **Schema/JSON-Schema caveats to document:** `request.payload` and `plugin:*` node
  `config` are intentionally unconstrained (`z.unknown()`); optional fields are modeled
  per `zod-to-json-schema` defaults. If we later target OpenAI strict Structured Outputs,
  note its limits (every property in `required`, no `minLength`/`pattern`, ≤100 props,
  ≤5 nesting levels) — but Ajv validation here has no such limits.
- **Testing:** Vitest suite covering — schema emitter drift guard (Phase 1); Ajv error
  formatting for each failure class (bad enum, missing required, wrong type, bad edge
  ref); `generate_workflow` round-trips through `validate_workflow`; example files
  validate against the generated schema (guards examples against schema changes too).
- **Versioning:** the generated schema carries `WORKFLOW_EXPORT_FORMAT` /
  `formatVersion`; bump the MCP package and regenerate whenever the workflow format
  version changes.

---

## Milestone summary

| Phase | Deliverable | Est. | Status |
|------|-------------|------|--------|
| 0 | Runnable package skeleton (stdio handshake) | 0.5d | ✅ Done |
| 1 | Zod→JSON Schema generation + drift guard | 1d | ✅ Done |
| 2 | `workflow://schema` + `workflow://examples/{name}` resources | 0.5d | ✅ Done |
| 3 | `get_workflow_schema` + `validate_workflow` (self-correcting errors) | 1.5d | ✅ Done |
| 4 | `generate_workflow` + "create from description" prompt | 1.5d | ✅ Done |
| 5 | Publish + 4 client configs + `.mcpb` | 1d | ⬜ Not started |
| 6 | (Deferred) live app state via local HTTP endpoint | — | ⬜ Deferred |

**Minimum shippable = Phases 0–3 + 5** (schema + validate + distribution). Phase 4 adds
generation ergonomics; Phase 6 only when state-awareness is genuinely required.
