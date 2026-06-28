import { sql } from 'drizzle-orm';
import type { AppDatabase } from './types';

/**
 * Runs `fn` inside a single SQLite transaction. On success the transaction is
 * committed; if `fn` throws, the transaction is rolled back and the error is
 * rethrown, guaranteeing all-or-nothing semantics (no partial writes).
 *
 * Note: SQLite does not support nested BEGIN; callers must not nest. For
 * composing units of work, build a single `fn` rather than nesting calls.
 */
export function withTransaction<T>(db: AppDatabase, fn: () => T): T {
  db.run(sql.raw('BEGIN'));
  try {
    const result = fn();
    db.run(sql.raw('COMMIT'));
    return result;
  } catch (error) {
    db.run(sql.raw('ROLLBACK'));
    throw error;
  }
}
