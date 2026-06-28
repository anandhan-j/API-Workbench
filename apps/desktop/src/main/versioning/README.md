# Versioning Module

Collection version control (Phase 7). It captures immutable snapshots of a collection's folder/request tree, lists the version history, diffs a version against the current state (or two versions against each other), summarizes the change per version, and restores the collection to any prior version.

See [Architecture.md](./Architecture.md) and [Phase 7](../../../../../docs/PHASE_7.md).

## Public API

- `VersioningService` — the orchestrator. Construct it with a `PersistenceService`.
  - `snapshot(collectionId, label?)` — captures the current tree as a new numbered version; returns the `CollectionVersion`. Records the collection's spec checksum (from `collection_sources`) at capture time.
  - `listVersions(collectionId)` — version metadata, newest first.
  - `getSnapshot(versionId)` — the parsed `VersionSnapshot`.
  - `diff(versionId)` — diffs a version (base) against the collection's current state (target).
  - `diffVersions(aId, bId)` — diffs two versions of the same collection.
  - `changeSummary(versionId)` — counts and a short text vs. the predecessor version.
  - `restore(versionId)` — rebuilds the live tree from the snapshot in one transaction, preserving ids. Returns a `RestoreResult`. **This is the acceptance feature.**

## Usage

```ts
const versioning = new VersioningService(persistence);

const v1 = versioning.snapshot(collectionId, 'before refactor');
// ... user edits the collection ...
const diff = versioning.diff(v1.id);          // what changed since v1
versioning.restore(v1.id);                    // roll the collection back to v1
```

## Persistence

Snapshots live in the `collection_versions` table (migration `0004-versions`): a sequential per-collection `number`, an optional `label`, the spec `checksum` (nullable), `created_at`, and the serialized `snapshot` JSON. Access goes through `CollectionVersionRepository`, exposed as `persistence.versions`.

## IPC

Wired to the renderer through `version.snapshot`, `version.list`, `version.diff`, `version.get`, and `version.restore`. On the renderer a **Versions** button on a collection opens a panel to snapshot, view per-version diffs against the current state, and restore.
