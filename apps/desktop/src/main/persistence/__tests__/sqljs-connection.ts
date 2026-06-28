import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import * as schema from '../schema';
import type { AppDatabase } from '../types';
import type { DatabaseConnection } from '../connection';

/**
 * Test-only DatabaseConnection backed by sql.js (pure WASM SQLite).
 *
 * sql.js and the production better-sqlite3 driver are both synchronous SQLite,
 * so the same schema, migrations, repositories, and backup logic run unchanged.
 * This lets the persistence layer be verified without a native build toolchain.
 */
export async function createSqlJsConnection(): Promise<DatabaseConnection> {
  const SQL = await initSqlJs();
  let sqlite: SqlJsDatabase = new SQL.Database();
  // Enforce foreign keys so cascade behaviour matches production.
  sqlite.run('PRAGMA foreign_keys = ON;');
  let db = drizzle(sqlite, { schema }) as unknown as AppDatabase;

  return {
    get db(): AppDatabase {
      return db;
    },
    snapshot(): Uint8Array {
      return sqlite.export();
    },
    restore(bytes: Uint8Array): void {
      sqlite.close();
      sqlite = new SQL.Database(bytes);
      sqlite.run('PRAGMA foreign_keys = ON;');
      db = drizzle(sqlite, { schema }) as unknown as AppDatabase;
    },
    close(): void {
      sqlite.close();
    },
  };
}
