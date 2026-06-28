import type { Migration } from './types';

/**
 * Adds OpenAPI sync support: a `source` baseline column on requests and a
 * `collection_sources` table recording the last spec a collection was synced
 * from. Must match `../schema.ts`.
 */
export const migration0003: Migration = {
  version: 3,
  name: 'sync',
  up: `
    ALTER TABLE requests ADD COLUMN source TEXT;

    CREATE TABLE collection_sources (
      collection_id TEXT PRIMARY KEY REFERENCES collections(id) ON DELETE CASCADE,
      spec_version  TEXT NOT NULL,
      title         TEXT NOT NULL,
      base_url      TEXT NOT NULL,
      checksum      TEXT NOT NULL,
      updated_at    INTEGER NOT NULL
    );
  `,
  down: `
    DROP TABLE IF EXISTS collection_sources;
    ALTER TABLE requests DROP COLUMN source;
  `,
};
