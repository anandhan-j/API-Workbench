import type { Migration } from './types';

/**
 * Adds collection management tables: collections, folders (self-nesting),
 * requests, and request history. Must match `../schema.ts`.
 */
export const migration0002: Migration = {
  version: 2,
  name: 'collections',
  up: `
    CREATE TABLE collections (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_collections_project ON collections(project_id);

    CREATE TABLE folders (
      id            TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      parent_id     TEXT REFERENCES folders(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      position      INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX idx_folders_collection ON folders(collection_id);
    CREATE INDEX idx_folders_parent ON folders(parent_id);

    CREATE TABLE requests (
      id            TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      folder_id     TEXT REFERENCES folders(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      method        TEXT NOT NULL,
      url           TEXT NOT NULL,
      favorite      INTEGER NOT NULL,
      position      INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX idx_requests_collection ON requests(collection_id);
    CREATE INDEX idx_requests_folder ON requests(folder_id);
    CREATE INDEX idx_requests_favorite ON requests(favorite);

    CREATE TABLE request_history (
      id         TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      opened_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_history_request ON request_history(request_id);
    CREATE INDEX idx_history_opened ON request_history(opened_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_history_opened;
    DROP INDEX IF EXISTS idx_history_request;
    DROP TABLE IF EXISTS request_history;
    DROP INDEX IF EXISTS idx_requests_favorite;
    DROP INDEX IF EXISTS idx_requests_folder;
    DROP INDEX IF EXISTS idx_requests_collection;
    DROP TABLE IF EXISTS requests;
    DROP INDEX IF EXISTS idx_folders_parent;
    DROP INDEX IF EXISTS idx_folders_collection;
    DROP TABLE IF EXISTS folders;
    DROP INDEX IF EXISTS idx_collections_project;
    DROP TABLE IF EXISTS collections;
  `,
};
