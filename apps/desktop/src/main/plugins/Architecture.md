# plugins — Architecture

## Trust model

Three trust zones (ADR-0007/0010):

```
renderer (sandboxed UI)          main process (privileged)              plugin host (utility process)
────────────────────────         ─────────────────────────────         ──────────────────────────────
Plugins page, SchemaForm,   IPC  PluginService ── loader (validate)     PluginHostRuntime
palette/editor plugin arms ────► PluginRepository / plugin_storage      ├─ loads bundled CJS entries
(declarative contributions       PluginHostManager ◄──── RPC ─────────► ├─ calls plugin.activate(ctx)
 only; no plugin code)           CapabilityBroker (grant enforcement)   └─ dispatches node/request/
                                 4 registries (builtins + plugin ids)      auth/importer executions
```

Plugin code executes **only** in the host process. The renderer sees only
declarative metadata (labels, icons, form schemas) served from persisted
manifests over `plugins.*` IPC channels. The main process validates every
value crossing either boundary: manifests and configs with Zod at
install/save time, RPC messages with `RpcMessage` on receipt, and every
plugin-produced result (`NodeExecuteResult`, `RequestExecuteResult`,
`AuthArtifacts`, `NormalizedSpec`) before use.

## Dispatch path (request-type example)

1. `ExecutionService.run(envelope)` resolves `plugin:<id>/<type>` in the
   `RequestTypeRegistry`.
2. The registry entry (installed by `host-manager.registerContributions`)
   validates the payload against the contribution's compiled `FormSchema`,
   applies `{{variable}}` substitution honoring per-field opt-outs, and asks
   `AuthService.resolveArtifacts` for artifacts (plugin auth types dispatch
   through the same bridge).
3. `RpcEndpoint.call('request.execute', …)` correlates the request, applies
   the caller's timeout, and forwards the caller's `AbortSignal` as a
   `cancel` message.
4. In the host, `PluginHostRuntime` re-derives an `AbortSignal`, finds the
   registered provider, and runs it. The raw result is Zod-parsed back in
   main and lifted into a full `ProtocolResponse` (ADR-0009).

Node executors, auth providers, and importers follow the same shape with
their own param/result schemas (`shared/plugin-rpc.ts`).

## Host lifecycle

- **Spawn** on first activation; the host emits `host.ready` within 5 s or
  the spawn fails.
- **Activate**: `plugin.activate` loads the entry (realpath-contained
  `require`), builds the capability-gated `PluginContext`, runs
  `activate()`, and returns what was registered. The manager cross-checks
  that list against the manifest — under- or over-registration fails the
  activation and surfaces as status `error`.
- **Crash**: on unexpected exit, in-flight RPCs reject with
  `E_HOST_CRASHED`, all plugin statuses become `host-failed`, registry
  entries are removed, and the manager respawns with exponential backoff
  (max 3 restarts per 5 minutes) before re-activating the previously active
  set. `plugins.changed` push events keep the renderer current.
- **Deactivate/uninstall**: registry entries are removed first, then the
  host is told; a wedged `deactivate()` cannot block unload.

## Capability enforcement

`PluginContext` members exist only for granted capabilities (UX gate), but
the **CapabilityBroker re-reads the persisted grant on every host→main
call** — a compromised host process cannot escalate by lying about its
plugin id's grants. Storage is quota-enforced (1 MB/value, 200 keys).
Filesystem, SQLite, secrets, and window access have no capability API at
all; the honest limits of process-level isolation and the Node
permission-model hardening path are recorded in ADR-0010.

## Testing seams

`HostTransport` is the seam: `InProcessHostTransport` runs the real
`PluginHostRuntime` (which is Electron-free; its module loader and fetch are
injectable) over an in-memory wire, so activation, dispatch, cancellation,
capability enforcement, and crash/respawn are all unit-testable. The
examples under `plugins/examples/` are real packages driven end-to-end
through the real loader in `__tests__/examples-e2e.test.ts`.
