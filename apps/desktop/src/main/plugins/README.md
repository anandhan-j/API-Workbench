# plugins

The Plugin SDK's privileged side (Phase 16, ADR-0007/0009/0010): everything the
main process does to install, validate, isolate, and dispatch third-party
plugins — without ever executing plugin code in this process.

## What lives here

- **`registries/`** — the four runtime extension registries (workflow node
  executors, auth providers, importers, request-type providers). Built-ins are
  seeded at the composition root; the host manager adds RPC-backed entries per
  activated plugin under `plugin:<pluginId>/<key>` ids.
- **`loader.ts`** — the security gate for plugin packages: manifest Zod
  validation, SDK semver compatibility, entry realpath containment, and safe
  `.awbx` (zip) extraction (no traversal/symlinks; entry/total/count limits).
- **`plugin-service.ts`** — install/uninstall/enable lifecycle facade backed by
  the `plugins` + `plugin_storage` tables; aggregates enabled plugins'
  declarative contributions for the renderer.
- **`host-manager.ts`** — owns the plugin host utility process: ready
  handshake, per-plugin activation (cross-checked against the manifest),
  registry bridging, and the crash/respawn policy.
- **`capability-broker.ts`** — serves host→main capability RPCs, re-checking
  the plugin's persisted, user-confirmed grants on every call and enforcing
  storage quotas. This is the enforcement point; the host's own gating is UX.
- **`host-transport.ts` / `host-transport-electron.ts`** — the transport seam:
  production forks the bundled `plugin-host.js` utility process; tests run the
  real host runtime in-process over an in-memory wire.

The unprivileged counterpart lives in `src/plugin-host/` (bundled separately;
fenced by ESLint from importing `@main` or `electron`). The public authoring
contract is `packages/plugin-sdk`; the validation authority for everything a
plugin declares is `shared/plugins.ts`.

## Adding a capability

Add it to `Capability` in `shared/plugins.ts`, expose the API in the SDK's
`PluginContext` + `plugin-host/sdk-runtime.ts`, and enforce it in
`capability-broker.ts`. Capabilities are a public SDK contract — additive only
within a major version (ADR-0007).

See `Architecture.md` for the dispatch and lifecycle diagrams, and
`docs/guides/PLUGIN_SDK.md` for the plugin-author view.
