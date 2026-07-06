# Phase 16 — Plugin SDK

This document records what the Phase 16 milestone delivers, the decisions taken, and its acceptance status. Phase 16 opens the platform: third parties can add workflow node types, request types, authentication providers, and importers without modifying the core, against a versioned, capability-constrained contract (ADR-0007).

## Delivered

**Protocol-agnostic execution (ADR-0009).** The HTTP-only execution model became a `RequestEnvelope` → provider → `ProtocolResponse` pipeline. HTTP is built-in provider #1 with unchanged semantics; plugins register further request types. Assertions, scripts, extraction, and the response viewer consume the protocol shape (with an HTTP view derived for status/header semantics), so every downstream feature works with plugin request types automatically. Existing saved requests, workflow graphs, and version snapshots keep working via parse-time lifting and an additive `requests.type` column (migration 0010).

**Runtime registries.** The four formerly hardcoded dispatch sites are registries seeded with built-ins: `NodeExecutorRegistry` (the workflow engine's `switch` extracted into an exhaustive built-in executor record), `AuthProviderRegistry` (behind the new async `AuthService.resolveArtifacts` facade, which also consolidated credential resolution), `ImporterRegistry` (OpenAPI 3 / Swagger 2 as entries, auto-detect with legacy-diagnostic fallback), and `RequestTypeRegistry`.

**Public SDK (`@api-workbench/plugin-sdk`).** A types-only, zero-dependency package (SDK_VERSION 1.0.0, semver-governed per ADR-0007): manifest and contribution types, the four extension-point contracts, declarative `FormSchema` types, and `definePlugin`. The desktop app never trusts SDK code — `shared/plugins.ts` (Zod) is the validation authority.

**Plugin loader and lifecycle.** Plugins install from a folder or `.awbx` archive into `<userData>/plugins/<id>` (plus a dev-mode "load unpacked"). The loader validates the manifest shape, semver SDK range, entry realpath containment, and archive safety (no traversal/symlinks; entry/total/count limits). Capability grants are user-confirmed at install and persisted (migration 0011: `plugins` + quota-enforced `plugin_storage` tables). The manifest carries a reserved `signature` field for a future marketplace.

**Isolated plugin host (ADR-0010).** All plugin code runs in a shared Electron utility process behind a Zod-validated RPC bridge with correlation ids, per-method timeouts, and AbortSignal-propagated cancellation. A capability broker re-checks persisted grants on every host→main call; storage quotas are enforced main-side. Crash policy: in-flight calls reject, statuses surface as `host-failed`, the host respawns with backoff (max 3/5 min) and re-activates. The `HostTransport` seam runs the real host runtime in-process for tests.

**Declarative plugin UI.** Contributions carry labels, allowlisted lucide icon names, and form schemas; the renderer draws them with one generic `SchemaForm` — no plugin code ever runs in the renderer. Plugin nodes appear in the workflow palette and inspector, plugin auth types in the auth editor, plugin request types in the request editor's type picker, and plugin importers in the import dialog's format select. A Plugins page (route + nav) handles install/consent/enable/uninstall and surfaces host errors, kept live by the `plugins.changed` push event.

## Key decisions

**Utility-process isolation over `node:vm`** — real process isolation and crash containment for marketplace code, with the honest limits and the Node permission-model hardening path recorded in ADR-0010. **Schema-driven forms over plugin React code** — keeps the renderer sandbox intact and covers the config-UI need declaratively. **Full protocol abstraction over an executor bolt-on** — one execution path for all request types, per the user decision to do the refactor properly in this phase. **Local install only, marketplace-ready** — manifest identity/semver/signature design anticipates a registry without building one.

## Tests and verification

The suite covers: the three registry families and both facades; the protocol dispatcher, HTTP provider, and legacy lifting; migrations 0010/0011 against sql.js; loader validation including hostile archives; the full host lifecycle over the in-process transport (activation cross-checks, capability enforcement, quotas, cancellation, crash/respawn); schema-form compilation; and renderer suites for SchemaForm, the Plugins page, and the plugin arms in existing editors. Example plugins under `plugins/examples/` exercise each extension point end-to-end through the real loader and host runtime.

## Acceptance criteria

Phase 16 requires that third-party plugins can be added without modifying the core. A plugin authored against `@api-workbench/plugin-sdk` — manifest plus one bundled CJS entry — installs from disk, is granted capabilities explicitly, and contributes working nodes, request types, auth providers, and importers through the same validated pipelines the built-ins use. Plugin loader, extension API, all four custom extension points, and the marketplace-ready architecture are implemented and tested.

## Known follow-ups

- **Native path picker for install.** The Plugins page installs from a typed
  path (archive or unpacked folder). A dedicated `dialog.openPath`-style IPC
  channel returning the picked path (with a directory option) would let a
  native file/folder picker feed the install flow; the existing `dialog.openFile`
  returns file *contents*, not a path, so it can't. Local install is fully
  functional today via the typed path.
- **Named plugin credentials.** Inline plugin auth on a request works end to end
  (the wire and stored request definition accept `plugin:`-typed auth via
  `WireAuthConfig`). Saving a plugin auth config as a *named, reusable*
  credential is not yet surfaced — the Credentials panel still offers only
  built-in schemes.
- **OS-enforced host sandbox.** Isolation is architectural in v1 (ADR-0010);
  the Node `--permission` spike for the utility process remains a fast-follow.

## Next

Phase 17 is Performance Optimization (lazy loading, virtualization, background workers, 100k-request collections). The plugin host's utility-process pattern established here is also the template Phase 17 can reuse for heavy background work. See the [Roadmap](./ROADMAP.md).
