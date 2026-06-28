import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from './types';
import { PersistenceError } from './types';
import { schemaMigrations } from './schema';
import { MIGRATIONS, type Migration } from './migrations';

/** Optional structured log sink so the migrator stays decoupled from the app logger. */
export type MigrationLogger = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
) => void;

const noopLogger: MigrationLogger = () => undefined;

function checksum(up: string): string {
  return createHash('sha256').update(up.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
}

/** Split a multi-statement SQL string into individual executable statements. */
function splitStatements(script: string): string[] {
  return script
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

function ensureLedger(db: AppDatabase): void {
  db.run(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        checksum   TEXT NOT NULL
      );`,
    ),
  );
}

function appliedVersions(db: AppDatabase): Map<number, string> {
  const rows = db
    .select({ version: schemaMigrations.version, checksum: schemaMigrations.checksum })
    .from(schemaMigrations)
    .all();
  return new Map(rows.map((r) => [r.version, r.checksum]));
}

/**
 * Applies all pending migrations in order. Each migration runs in its own
 * transaction: if any statement fails the whole migration rolls back, so the
 * database is never left half-migrated (no data loss; rollback supported).
 *
 * Already-applied migrations are skipped. If an applied migration's checksum no
 * longer matches its source, that is treated as tampering and rejected.
 *
 * Returns the versions that were applied during this call.
 */
export function applyMigrations(
  db: AppDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
  log: MigrationLogger = noopLogger,
): number[] {
  ensureLedger(db);
  const applied = appliedVersions(db);
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const newlyApplied: number[] = [];

  for (const migration of ordered) {
    const sum = checksum(migration.up);
    const existing = applied.get(migration.version);

    if (existing !== undefined) {
      if (existing !== sum) {
        throw new PersistenceError(
          `Checksum mismatch for migration ${migration.version} (${migration.name}); ` +
            `the migration source changed after it was applied`,
        );
      }
      continue;
    }

    db.run(sql.raw('BEGIN'));
    try {
      for (const statement of splitStatements(migration.up)) {
        db.run(sql.raw(statement));
      }
      db.insert(schemaMigrations)
        .values({
          version: migration.version,
          name: migration.name,
          appliedAt: Date.now(),
          checksum: sum,
        })
        .run();
      db.run(sql.raw('COMMIT'));
      newlyApplied.push(migration.version);
      log('info', `Applied migration ${migration.version}`, { name: migration.name });
    } catch (error) {
      db.run(sql.raw('ROLLBACK'));
      log('error', `Migration ${migration.version} failed and was rolled back`, {
        name: migration.name,
        message: (error as Error).message,
      });
      throw new PersistenceError(
        `Migration ${migration.version} (${migration.name}) failed; rolled back`,
        { cause: error },
      );
    }
  }

  return newlyApplied;
}

/**
 * Reverts migrations down to (but not including) `targetVersion`, newest first.
 * Each reversion runs in its own transaction. Use `targetVersion = 0` to revert
 * everything.
 */
export function rollbackTo(
  db: AppDatabase,
  targetVersion: number,
  migrations: readonly Migration[] = MIGRATIONS,
  log: MigrationLogger = noopLogger,
): number[] {
  ensureLedger(db);
  const applied = appliedVersions(db);
  const toRevert = [...migrations]
    .filter((m) => applied.has(m.version) && m.version > targetVersion)
    .sort((a, b) => b.version - a.version);
  const reverted: number[] = [];

  for (const migration of toRevert) {
    db.run(sql.raw('BEGIN'));
    try {
      for (const statement of splitStatements(migration.down)) {
        db.run(sql.raw(statement));
      }
      db.delete(schemaMigrations).where(sql`version = ${migration.version}`).run();
      db.run(sql.raw('COMMIT'));
      reverted.push(migration.version);
      log('info', `Reverted migration ${migration.version}`, { name: migration.name });
    } catch (error) {
      db.run(sql.raw('ROLLBACK'));
      throw new PersistenceError(
        `Rollback of migration ${migration.version} (${migration.name}) failed`,
        { cause: error },
      );
    }
  }

  return reverted;
}

/** The highest applied migration version, or 0 if none. */
export function currentVersion(db: AppDatabase): number {
  ensureLedger(db);
  const versions = [...appliedVersions(db).keys()];
  return versions.length ? Math.max(...versions) : 0;
}
