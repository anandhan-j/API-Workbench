# Phase 6 — OpenAPI Synchronization Engine

This document records what the Phase 6 milestone delivers, the decisions taken, and its acceptance status. Phase 6 keeps an imported collection up to date as its OpenAPI spec evolves, without destroying the user's manual work.

## Delivered

A synchronization engine (`SyncService` in `apps/desktop/src/main/openapi`) plus the persistence and UI to support it.

Every request generated from a spec now stores a `source` baseline (the operation key and the spec's method/url/name at import time), and each collection records the spec it was imported or synced from in a `collection_sources` table (added by migration `0003`). Given a changed spec, the engine re-parses and normalizes it, then performs a three-way merge against the existing spec-originated requests: new operations are added, operations missing from the new spec are detected as removed, and matching operations are reconciled field by field. For each field it compares the current value, the stored baseline, and the new spec value — unedited fields are updated to the spec; manually edited fields are preserved in **safe** mode (and reported as conflicts when the spec also changed) or overwritten in **replace** mode. A request removed from the spec is deleted unless it was manually edited, in which case safe mode keeps it. The whole merge runs in one transaction and refreshes the stored spec checksum.

It is wired to the renderer through an `openapi.sync` IPC channel and composed in the bootstrap. On the renderer, a **Sync** button on a collection opens a panel to paste the updated spec (or give a URL), choose safe-merge or replace, and see a summary of added / updated / removed / conflicting / preserved requests.

## Key decisions

**Three-way merge with a stored baseline.** Preserving manual edits requires knowing what the spec last set, so each generated request carries a `source` baseline. Comparing current vs. baseline vs. new-spec is what distinguishes a user edit from a spec change and lets the engine merge safely instead of clobbering.

**Identity by `METHOD path`.** Operations are matched across syncs by their method-and-path key, independent of name or URL, so renaming a request locally or changing its URL doesn't break the link to its spec operation.

**Safe by default, replace on request.** The default preserves user work and surfaces conflicts; replace is available when the user wants the spec to win. Removed-but-edited requests are kept in safe mode, matching the "manual edits remain intact" requirement.

## Tests and verification

Seven tests cover the engine end to end: add and remove on spec change, updating an unedited request, preserving a manual edit while reporting a conflict (safe mode), overwriting it (replace mode), not flagging a conflict when only the local side changed, keeping a removed-but-edited request in safe mode while deleting it in replace mode, and recording the new spec checksum. Three React Testing Library tests cover the Sync panel (mode-aware submission and the result summary). Together with the prior phases the suite is **84 tests across 18 files, all passing**, and the renderer/shared and service TypeScript projects type-check cleanly. (Migration `0003` adds and, on rollback, drops the `source` column; the existing migrator and backup tests already track the migration count.)

As before, the headless sandbox verifies typecheck and tests but cannot launch Electron or compile the native driver; the live application runs on a developer workstation per [Getting Started](./guides/GETTING_STARTED.md).

## Acceptance criteria

Phase 6 requires that manual edits remain intact after synchronization. This is demonstrated directly: a locally renamed request keeps its name through a sync that changes the same operation (reported as a conflict rather than overwritten), an edited request that the spec deletes is preserved in safe mode, and only an explicit replace-mode sync overwrites or removes edited requests. The required pieces — diff engine, merge engine, conflict detection, safe merge, replace mode, incremental updates, removed-endpoint detection, and metadata preservation — are all present.

## Next

Phase 7 (Collection Version Control) adds version snapshots, a diff viewer, and rollback over the collection, building on the spec checksums recorded here. See the [Roadmap](./ROADMAP.md).
