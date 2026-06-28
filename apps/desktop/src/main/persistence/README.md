# Persistence Module

The local persistence layer for API Workbench. It owns the SQLite database, schema migrations, the repository API, transactions, and the backup/restore engine. It runs only in the Electron main process; the renderer reaches it exclusively over the validated IPC contract.

See [ADR-0004](../../../../../docs/adr/0004-persistence-sqlite-drizzle.md) for the technology decision and [Architecture.md](./Architecture.md) for the internal design.

## Public API

Import from the module barrel (`./index`):

- `PersistenceService` — the facade. Construct it with a `DatabaseConnection` and options; it runs migrations and exposes repositories, transactions, and backups.
- `createBetterSqliteConnection(filePath)` — opens the production database (WAL, foreign keys on).
- Repositories: `WorkspaceRepository`, `ProjectRepository`, `PreferencesRepository`, `CacheRepository`.
- Migrations: `applyMigrations`, `rollbackTo`, `currentVersion`, `MIGRATIONS`.
- `withTransaction(db, fn)` — all-or-nothing unit of work.
- `BackupService` — lower-level backup engine (the service wraps it).
- Errors: `PersistenceError`, `NotFoundError`, `ConflictError`.

## Usage

```ts
import { join } from 'node:path';
import { app } from 'electron';
import { createBetterSqliteConnection, PersistenceService } from './persistence';

const connection = createBetterSqliteConnection(join(app.getPath('userData'), 'data', 'workbench.db'));
const persistence = new PersistenceService(connection, {
  backupDir: join(app.getPath('userData'), 'backups'),
  appVersion: app.getVersion(),
});

// migrations have already run; use the repositories
const ws = persistence.workspaces.create({ name: 'Default' });
persistence.preferences.set('window', { width: 1280 });

// transactional unit of work
persistence.transaction(() => {
  const project = persistence.projects.create({ workspaceId: ws.id, name: 'API' });
  persistence.preferences.set('lastProject', project.id);
});

// backup / restore
const backup = persistence.createBackup();
persistence.restoreBackup(backup.id); // takes a safety backup first
```

## Adding a migration

Create `migrations/000N-<name>.ts` exporting a `Migration` (version, name, up, down SQL), append it to `MIGRATIONS` in `migrations/index.ts`, and update `schema.ts` to match. Never edit a released migration — its checksum is recorded and a changed checksum is rejected as tampering.

## Testing

The layer is driver-agnostic: every module except `database.ts` avoids the native driver, so tests run against `sql.js` (pure WASM) with no native build. See `__tests__/` for the migrator, repository, transaction, and backup suites.
