import type { Migration } from './types';

/**
 * Adds the `auth_configs` table for stored, reusable authentication credentials
 * (Phase 9). Secret material in `config` is encrypted when `encrypted` is true.
 * Must match `../schema.ts`.
 */
export const migration0006: Migration = {
  version: 6,
  name: 'auth',
  up: `
    CREATE TABLE auth_configs (
      id         TEXT PRIMARY KEY,
      scope      TEXT NOT NULL,
      scope_id   TEXT NOT NULL DEFAULT '',
      name       TEXT NOT NULL,
      type       TEXT NOT NULL,
      config     TEXT NOT NULL,
      encrypted  INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_auth_configs_unique ON auth_configs(scope, scope_id, name);
    CREATE INDEX idx_auth_configs_scope ON auth_configs(scope, scope_id);
  `,
  down: `
    DROP INDEX IF EXISTS idx_auth_configs_scope;
    DROP INDEX IF EXISTS idx_auth_configs_unique;
    DROP TABLE IF EXISTS auth_configs;
  `,
};
