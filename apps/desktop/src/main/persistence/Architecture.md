# Persistence — Architecture

This module implements the local persistence layer described in [Phase 2](../../../../../docs/PHASE_2.md). Its central design property is **driver independence**: the entire layer is written against Drizzle's generic synchronous SQLite database, and only one file binds a concrete driver. This is what lets production use the fast native `better-sqlite3` while tests run against pure-WASM `sql.js` with the same code paths.

## Layering

```
PersistenceService (facade)
  ├─ migrator            apply / rollback / version, transactional, checksum-guarded
  ├─ repositories        WorkspaceRepository, ProjectRepository, PreferencesRepository, CacheRepository
  ├─ transaction         withTransaction(): BEGIN / COMMIT / ROLLBACK
  └─ BackupService       snapshot → file + sidecar, checksum-verified restore

DatabaseConnection (interface)   ← the only seam to a concrete driver
  ├─ BetterSqliteConnection  (database.ts)   production, native
  └─ sql.js connection       (__tests__)     verification, WASM
```

`schema.ts` is the typed source of truth for table shapes; the raw SQL in `migrations/` creates those exact tables. The two are kept in lockstep by convention and guarded by tests that assert the expected tables exist after migration.

## Driver seam

`DatabaseConnection` exposes the Drizzle handle (`db`), a `snapshot()`/`restore()` pair for backups, and `close()`. Production implements it with better-sqlite3 (`serialize()` for snapshot, reopen-from-file for restore). Tests implement it with sql.js (`export()` / `new Database(bytes)`). Because both drivers are synchronous SQLite, the repositories, migrator, transaction helper, and backup engine are byte-for-byte identical across the two — the seam is the connection alone (`AppDatabase` keeps the driver-specific run-result type open).

## Migrations and safety

Migrations are plain forward/backward SQL applied by a hand-rolled runner rather than a generated journal, which gives precise control over the two acceptance guarantees. Each migration runs inside its own `BEGIN … COMMIT`; any failure triggers `ROLLBACK`, so the database is never left half-migrated (**no data loss**, **rollback supported**). A ledger table (`schema_migrations`) records the applied version, timestamp, and a checksum of the migration source; re-running is a no-op (**automatic, idempotent migrations**), and a checksum that no longer matches its source is rejected as tampering. `rollbackTo(version)` reverts with the `down` SQL, newest first.

## Transactions

`withTransaction` wraps a synchronous unit of work in a single SQLite transaction, committing on success and rolling back on any thrown error. SQLite has no nested `BEGIN`, so callers compose one unit of work rather than nesting calls; this keeps the semantics simple and predictable.

## Backups

A backup is a serialized database snapshot written to `backup-<ts>-<id>.sqlite` plus a JSON sidecar holding its `BackupInfo` (id, size, sha256 checksum, schema version, app version). Restore verifies the checksum before applying and first takes an automatic **safety backup** of the current state, so a restore is itself recoverable. After restore the service re-applies migrations (auto-upgrading an older backup) and rebuilds the repositories against the restored handle.

## Boundaries

The module imports no Electron API except indirectly through the composition root that constructs the production connection and passes a log sink. It exposes typed DTOs (from `@shared/persistence`) rather than raw rows, so the IPC layer and renderer never depend on Drizzle internals. This keeps persistence a self-contained, independently testable unit consistent with the project's clean-architecture dependency direction.
