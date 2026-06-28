import type { Migration } from './types';

/**
 * Initial schema. Creates workspaces, projects, preferences, and cache tables.
 * The `schema_migrations` ledger is created by the migrator itself, so it is not
 * part of this migration. The SQL here must match `../schema.ts`.
 */
export const migration0001: Migration = {
  version: 1,
  name: 'initial',
  up: `
    CREATE TABLE workspaces (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      settings   TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE projects (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE INDEX idx_projects_workspace ON projects(workspace_id);

    CREATE TABLE preferences (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE cache_entries (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX idx_cache_expires ON cache_entries(expires_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_cache_expires;
    DROP TABLE IF EXISTS cache_entries;
    DROP TABLE IF EXISTS preferences;
    DROP INDEX IF EXISTS idx_projects_workspace;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS workspaces;
  `,
};
