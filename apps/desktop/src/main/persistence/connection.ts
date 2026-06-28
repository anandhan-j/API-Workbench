import type { AppDatabase } from './types';
import type { DatabaseSnapshotSource } from './snapshot';

/**
 * A live database connection. Exposes the Drizzle handle, can serialize/restore
 * itself (for backups), and can be closed. Implementations own a concrete driver
 * (better-sqlite3 in production, sql.js in tests); on `restore` they swap their
 * internal handle, so consumers must re-read `db` afterwards.
 */
export interface DatabaseConnection extends DatabaseSnapshotSource {
  readonly db: AppDatabase;
  close(): void;
}
