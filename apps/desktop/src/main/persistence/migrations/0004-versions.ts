import type { Migration } from './types';

/**
 * Adds collection version control: a `collection_versions` table holding an
 * immutable JSON snapshot of a collection's tree, a sequential per-collection
 * version number, an optional label, and the spec checksum at snapshot time.
 * Must match `../schema.ts`.
 */
export const migration0004: Migration = {
  version: 4,
  name: 'versions',
  up: `
    CREATE TABLE collection_versions (
      id            TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      number        INTEGER NOT NULL,
      label         TEXT,
      checksum      TEXT,
      created_at    INTEGER NOT NULL,
      snapshot      TEXT NOT NULL
    );

    CREATE INDEX idx_collection_versions_collection ON collection_versions(collection_id);
  `,
  down: `
    DROP TABLE IF EXISTS collection_versions;
  `,
};
