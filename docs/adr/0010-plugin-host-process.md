# ADR-0010: Plugin host as a shared utility process with a brokered RPC bridge

- **Status:** Accepted
- **Date:** 2026-07-02
- **Related:** ADR-0003, ADR-0007, ADR-0009

## Context

ADR-0007 requires plugin execution to be "isolated from privileged internals" and left the mechanism open. The only in-repo sandbox was `node:vm`, which isolates globals but is **not a security boundary** (prototype-chain escapes, no resource isolation, and any leaked host object is a full compromise). Phase 16 had to pick the mechanism third-party marketplace plugins actually run under.

## Decision

All plugin code runs in **one shared Electron `utilityProcess`** ("plugin host"), forked from the main process, communicating over a Zod-validated RPC protocol with correlation ids, per-method timeouts, and `AbortSignal`-propagated cancellation. The host has no database handle, no encryption keys, no Electron `session`, and no window access; everything it can do flows through two narrow surfaces:

1. **Main→host dispatch** — activate/deactivate and the four extension-point executions (node, request type, auth apply, importer). Inputs are validated against the contribution's declared form schema before dispatch; every result the host returns is Zod-parsed in main before use.
2. **Host→main capability calls** — brokered by a `CapabilityBroker` that re-reads the plugin's *persisted, user-confirmed* grants on every call (the host's own gating is UX, not enforcement) and enforces storage quotas. v1 capabilities: `network`, `variables:read`, `variables:write`; per-plugin KV storage and logging are implicit. Secrets, filesystem, SQLite, and workspace mutation have **no capability** — unreachable by design.

Lifecycle: 5-second ready handshake; per-plugin activation cross-checks the module's registrations against its manifest (both under- and over-registration fail activation). On unexpected exit, in-flight RPCs reject with `E_HOST_CRASHED`, plugin statuses surface as `host-failed`, contributions are unregistered, and the manager respawns with exponential backoff (max 3 restarts per 5 minutes) and re-activates. The transport is a seam (`HostTransport`): production forks the utility process; tests run the *real* host runtime in-process over an in-memory wire, which is what makes the whole lifecycle unit-testable without Electron.

## Honest isolation limits

A Node utility process can still `require('node:fs')` and open sockets: v1 mediation of filesystem/network is **architectural** (no capability API offers them; the auditable surface is the broker) rather than OS-enforced. What the process split does buy: no shared memory with privileged internals, schema validation at every boundary, crash containment, and kill-ability. Hardening follow-up (tracked, not a Phase 16 gate): launch the host under Node's permission model (`--permission --allow-fs-read=<pluginsDir>`) once its behavior inside Electron's `utilityProcess` is verified, and per-plugin processes for fault isolation — the transport seam admits both without API changes.

## Alternatives considered

**`node:vm` in-process** was rejected as the primary mechanism: not a security boundary, no crash containment, and it would put untrusted code inside the process that holds decrypted secrets. **`isolated-vm`/QuickJS** offer stronger JS isolation but add native-module ABI pain (already a sore point with better-sqlite3) and still share the privileged process. **A process per plugin** was deferred: strictly better fault isolation, but N processes × startup cost for the common one-or-two-plugins case; the transport seam keeps it a configuration change. **Renderer-hosted plugin UI code** was rejected outright — contributions are declarative (ADR-0007), so no third-party code ever reaches the renderer.

## Consequences

Marketplace plugins run with real process isolation, validated contracts on every hop, and user-consented capabilities enforced at the trust boundary. The costs: one more bundle target (`plugin-host.js`) and its ESLint import fence; RPC latency on every plugin execution (irrelevant next to network I/O the plugins exist to do); a shared host couples plugin crashes until per-plugin processes land; and the SDK's `ctx.fetch`/`ctx.storage` surface must remain small and stable because it is now a public, versioned contract (ADR-0007).
