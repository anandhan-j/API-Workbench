import type { Migration } from './types';

/**
 * Adds `source_url` to `collection_sources` so a URL-imported collection
 * remembers where it came from and the Sync panel can pre-fill that URL.
 * Null for collections imported from pasted text. Must match `../schema.ts`.
 */
export const migration0008: Migration = {
  version: 8,
  name: 'collection-source-url',
  up: `
    ALTER TABLE collection_sources ADD COLUMN source_url TEXT;
  `,
  down: `
    CREATE TABLE collection_sources_no_url (
      collection_id TEXT PRIMARY KEY,
      spec_version  TEXT NOT NULL,
      title         TEXT NOT NULL,
      base_url      TEXT NOT NULL,
      checksum      TEXT NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    INSERT INTO collection_sources_no_url
      SELECT collection_id, spec_version, title, base_url, checksum, updated_at
      FROM collection_sources;
    DROP TABLE collection_sources;
    ALTER TABLE collection_sources_no_url RENAME TO collection_sources;
  `,
};
