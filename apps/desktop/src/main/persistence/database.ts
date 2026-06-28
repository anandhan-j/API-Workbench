import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import type { AppDatabase } from './types';
import type { DatabaseConnection } from './connection';

/**
 * Production database connection backed by better-sqlite3.
 *
 * This is the ONLY module that imports a native SQLite driver, so the rest of
 * the persistence layer stays driver-agnostic and testable with sql.js. Opens
 * the database file with WAL journaling, enforced foreign keys, and a balanced
 * durability setting.
 *
 * See ADR-0004.
 */

function openSqlite(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  return db;
}

export class BetterSqliteConnection implements DatabaseConnection {
  private sqlite: Database.Database;
  private drizzleDb: AppDatabase;

  constructor(private readonly filePath: string) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.sqlite = openSqlite(filePath);
    this.drizzleDb = drizzle(this.sqlite, { schema });
  }

  get db(): AppDatabase {
    return this.drizzleDb;
  }

  snapshot(): Uint8Array {
    return this.sqlite.serialize();
  }

  restore(bytes: Uint8Array): void {
    this.sqlite.close();
    writeFileSync(this.filePath, bytes);
    this.sqlite = openSqlite(this.filePath);
    this.drizzleDb = drizzle(this.sqlite, { schema });
  }

  close(): void {
    this.sqlite.close();
  }
}

/** Opens (creating if needed) the production database at `filePath`. */
export function createBetterSqliteConnection(filePath: string): DatabaseConnection {
  return new BetterSqliteConnection(filePath);
}
