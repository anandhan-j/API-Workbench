import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * The application database handle. Typed against Drizzle's generic synchronous
 * SQLite database so both the production better-sqlite3 connection and the
 * sql.js test harness satisfy it. The middle (run-result) type parameter varies
 * by driver, so it is intentionally left open.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppDatabase = BaseSQLiteDatabase<'sync', any, typeof schema>;

/** Base class for all persistence-layer errors. */
export class PersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'PersistenceError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/** Raised when an entity expected to exist was not found. */
export class NotFoundError extends PersistenceError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

/** Raised when an operation violates a uniqueness or integrity constraint. */
export class ConflictError extends PersistenceError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConflictError';
  }
}
