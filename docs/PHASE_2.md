# Phase 2 — Local Persistence Layer

This document records what the Phase 2 milestone delivers, the decisions taken, and its acceptance status. Phase 2 gives the application durable local storage that every data-bearing phase builds on.

## Delivered

A complete SQLite persistence layer under `apps/desktop/src/main/persistence`, built on Drizzle ORM and following the [target architecture](./architecture/ARCHITECTURE.md) and [ADR-0004](./adr/0004-persistence-sqlite-drizzle.md).

The schema (`schema.ts`) defines workspaces, projects, preferences, a cache table, and the migration ledger, with a cascading foreign key from projects to workspaces. A transactional migration runner applies versioned SQL migrations automatically on startup, records each in a checksummed ledger, is idempotent on re-run, rejects tampered migrations, and supports rollback. The repository layer provides typed CRUD for workspaces, projects, preferences (JSON values), and the cache (with TTL expiry and pruning), returning shared DTOs rather than raw rows. A `withTransaction` helper gives all-or-nothing units of work. The backup engine snapshots the database to a checksummed file plus metadata sidecar, lists and prunes backups, and restores with checksum verification after taking an automatic safety backup. The `PersistenceService` facade composes all of this, runs migrations on construction, and rebuilds itself after a restore.

The layer is wired to the renderer through the typed IPC contract: workspace, project, preferences, and backup channels were added to `shared/ipc-contract.ts`, their handlers registered in the main process, and the `PersistenceService` is composed in the main bootstrap against the database stored under the OS user-data directory.

## Key decision: driver-agnostic with a single native seam

Production uses the native `better-sqlite3` driver as the architecture mandates. To keep the layer verifiable without a native build toolchain — and to keep it portable — every module is written against Drizzle's generic synchronous SQLite database, and only `database.ts` imports a concrete driver. Tests run the identical schema, migrations, repositories, transactions, and backup logic against pure-WASM `sql.js`. Because both drivers are synchronous SQLite, the verified code path is the same one that ships. This was necessary because the build sandbox cannot compile native modules (its network blocks the prebuilt-binary host and Node headers), and it is good design regardless: the persistence core has exactly one point of coupling to a driver.

## Tests and verification

Sixteen tests cover the migrator (apply, idempotency, checksum-tamper rejection, failed-migration rollback leaving no partial tables, revert-to-version), the repositories (workspace CRUD, project cascade-on-delete, preference JSON round-trip and upsert, cache TTL expiry and prune), transactions (commit-all and rollback-all with no data loss), and backup/restore (restore to backup-time state, safety backup before restore, corrupted-backup rejection, list-newest-first and prune). All pass, together with the Phase 1 suite — **43 tests across 10 files**. The renderer/shared and the persistence TypeScript projects type-check cleanly.

As in Phase 1, the headless sandbox verifies typecheck and tests but cannot launch Electron or compile the native driver; running the app with the live better-sqlite3 database is done on a developer workstation per [Getting Started](./guides/GETTING_STARTED.md).

## Acceptance criteria

Phase 2 requires no data loss, supported rollback, and automatic migrations. Each is demonstrated by a passing test: failed migrations and failed transactions roll back completely with no partial writes (no data loss); `rollbackTo` reverts applied migrations and restore recovers a prior state with a safety net (rollback supported); migrations apply on startup and are idempotent and checksum-guarded (automatic migrations). The deliverables called for — database schema, migration system, and backup engine — are all present.

## Next

Phase 3 (Workspace Management) builds the user-facing workspace and project experience on top of this layer — open/close/recent projects, import/export, and per-workspace settings — surfaced through the renderer. See the [Roadmap](./ROADMAP.md).
