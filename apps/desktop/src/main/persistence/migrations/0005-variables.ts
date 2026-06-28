import type { Migration } from './types';

/**
 * Adds the variable engine (Phase 8): a single `variables` table holding scoped
 * variables (global, workspace, collection, folder, request, workflow), each
 * optionally flagged secret and/or stored encrypted.
 *
 * `scope_id` is stored as the empty string ('') for the global scope rather than
 * NULL. SQLite treats NULLs as distinct in UNIQUE indexes, which would let
 * duplicate global keys slip through; using '' keeps the (scope, scope_id, key)
 * uniqueness constraint meaningful for global variables too. Must match
 * `../schema.ts`.
 */
export const migration0005: Migration = {
  version: 5,
  name: 'variables',
  up: `
    CREATE TABLE variables (
      id         TEXT PRIMARY KEY,
      scope      TEXT NOT NULL,
      scope_id   TEXT NOT NULL DEFAULT '',
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      secret     INTEGER NOT NULL DEFAULT 0,
      encrypted  INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX idx_variables_unique ON variables(scope, scope_id, key);
    CREATE INDEX idx_variables_scope ON variables(scope, scope_id);
  `,
  down: `
    DROP TABLE IF EXISTS variables;
  `,
};
