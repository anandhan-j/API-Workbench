# Versioning — Architecture

This module is a thin application service over one new repository. Its job is to turn a collection's live, mutable tree into immutable, restorable snapshots, and to compute the differences between them.

## Snapshot shape

A version stores a self-contained JSON `VersionSnapshot`: a flat list of folders (`id`, `parentId`, `name`, `position`) and requests (`id`, `folderId`, `name`, `method`, `url`, `favorite`, `source`, `position`). It is deliberately denormalized and id-bearing so a restore can recreate the exact tree — same ids — without consulting any other state. The snapshot is captured inside a transaction together with reading the collection's spec checksum, so a version is a consistent point-in-time record tied back to the OpenAPI source recorded in Phase 6.

## Diff

`diff` parses a version (the base) and builds a fresh snapshot of the current tree (the target); `diffVersions` parses two stored snapshots. Both feed one pure `computeDiff`, which matches requests and folders by id:

- **added** — present in target, absent in base.
- **removed** — present in base, absent in target.
- **modified** — same id, with field-level changes (`name`, `method`, `url`, `favorite`, `folderId`).

Matching by id (not by name or position) is what makes a rename register as a modification rather than an add+remove pair. `changeSummary` runs the same engine against the immediately preceding version to produce the per-version counts and text shown in the history.

## Restore — the acceptance feature

`restore` runs entirely in one transaction: it deletes the collection's current requests then folders, then re-inserts the snapshot. Because folders carry a self-referential `parent_id` foreign key, they must be inserted parents-before-children; `orderFoldersParentsFirst` does a BFS from the roots (folders whose parent is null or absent from the snapshot) so every parent exists before its child is inserted. Requests are inserted afterward, when all their folders exist. Ids are preserved, so favorites and history that reference requests by id survive a rollback, and re-snapshotting a restored collection reproduces the original snapshot.

Writes go through the Drizzle handle (`persistence.db`) rather than the repositories because restore must set explicit ids, positions, and the `source` baseline verbatim — the repositories generate fresh ids and positions by design. Everything still rides the same transaction and foreign-key enforcement.

## Why a service, not the explorer

The `CollectionExplorer` owns interactive, validated, single-item mutations. Versioning is a different concern — bulk, atomic, id-preserving capture and replacement — so it lives in its own service with its own repository. It imports no Electron API and is verified entirely against sql.js.
