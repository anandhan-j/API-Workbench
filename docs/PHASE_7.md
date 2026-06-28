# Phase 7 — Collection Version Control

This document records what the Phase 7 milestone delivers, the decisions taken, and its acceptance status. Phase 7 lets a user capture point-in-time snapshots of a collection, see what changed between them, and roll the collection back to any earlier state.

## Delivered

A versioning engine (`VersioningService` in `apps/desktop/src/main/versioning`) plus the persistence and UI to support it.

Each snapshot captures the collection's full folder/request tree as immutable JSON, with a sequential per-collection version number, an optional label, and the collection's OpenAPI spec checksum at capture time (read from the `collection_sources` table added in Phase 6). Snapshots are stored in a new `collection_versions` table (migration `0004`) and accessed through a `CollectionVersionRepository`, exposed as `persistence.versions`.

The service provides the version history (newest first, with folder/request counts), a diff of a version against the collection's current state — or of two versions against each other — reporting added, removed, and field-level modified requests and added/removed folders, a per-version change summary against its predecessor, and a **restore** that rebuilds the live tree from a snapshot.

It is wired to the renderer through `version.snapshot`, `version.list`, `version.diff`, `version.get`, and `version.restore` IPC channels and composed in the bootstrap. On the renderer, a **Versions** button on a collection opens a panel to capture a labelled snapshot, list the history with counts and spec checksum, view each version's diff against the current state, and restore the collection to a version.

## Key decisions

**Self-contained, id-bearing snapshots.** A version stores a denormalized JSON tree including the original ids. This makes a restore a pure function of the snapshot — no other state is consulted — and lets the restore recreate the exact ids, so favorites and history that reference requests by id survive a rollback.

**Diff by id, not by position.** Requests and folders are matched across states by id, so a rename or a move registers as a modification of one entity rather than an add plus a remove. Modified requests carry field-level detail (which of name/method/url/favorite/folderId changed, before and after).

**Restore is one transaction with parents-before-children inserts.** Restoring clears the collection's requests then folders and re-inserts the snapshot inside a single transaction. Folders carry a self-referential `parent_id` foreign key, so they are inserted in BFS order from the roots, guaranteeing each parent exists before its child. The restore writes through the Drizzle handle rather than the repositories because it must set explicit ids, positions, and the spec baseline verbatim.

**Checksum association.** Each snapshot records the collection's spec checksum, tying a version to the OpenAPI source it was synced from and letting the history show which versions share a spec.

## Tests and verification

Nine service tests (sql.js) cover snapshot creation and sequential numbering, recording the spec checksum, listing newest-first, diffing a version against the current state (added / removed / field-level modified), the per-version change summary against its predecessor, restoring a heavily mutated collection back to a snapshot exactly (ids and favorites preserved), restoring after the collection content is fully cleared, and diffing two versions. Four React Testing Library tests cover the Versions panel (labelled snapshot submission, empty state, listing and restore, and the diff summary).

The migrator and backup tests already track the migration count via `MIGRATIONS.length` / `service.schemaVersion()`, so adding migration `0004` required no changes there. Migration `0004` creates the `collection_versions` table and its index, and drops the table on rollback.

As in earlier phases, the headless sandbox verifies the service and renderer/shared TypeScript projects and the full vitest suite, but cannot launch Electron or compile the native driver; the live application runs on a developer workstation per [Getting Started](./guides/GETTING_STARTED.md).

## Acceptance criteria

Phase 7 requires that a user can restore any previous collection version. This is demonstrated directly: a collection with nested folders, a favorited request, and a root request is snapshotted, then heavily mutated (a folder and its request deleted, a request renamed, a new request added), and `restore` brings the tree back to match the snapshot exactly — same structure, same ids, same favorite. Restore also recovers a collection whose contents were entirely deleted. The required pieces — version snapshots, diff between versions and version-vs-current, rollback/restore, version history, per-version change summary, and association with the collection's spec checksum — are all present.

## Next

This completes the version-control milestone on the roadmap. See the [Roadmap](./ROADMAP.md).
