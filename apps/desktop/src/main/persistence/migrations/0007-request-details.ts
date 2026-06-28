import type { Migration } from './types';

/**
 * Adds the `details` column to `requests`: a JSON blob holding the full editable
 * request definition (headers, query params, body, auth, options). Populated from
 * the OpenAPI spec on import and overwritten when the user saves edits. Null for
 * pre-existing or hand-created requests until first saved. Must match `../schema.ts`.
 */
export const migration0007: Migration = {
  version: 7,
  name: 'request-details',
  up: `
    ALTER TABLE requests ADD COLUMN details TEXT;
  `,
  // SQLite cannot drop a column on older engines; rebuild the table without it.
  down: `
    CREATE TABLE requests_no_details (
      id            TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      folder_id     TEXT,
      name          TEXT NOT NULL,
      method        TEXT NOT NULL,
      url           TEXT NOT NULL,
      favorite      INTEGER NOT NULL,
      position      INTEGER NOT NULL,
      source        TEXT,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    INSERT INTO requests_no_details
      SELECT id, collection_id, folder_id, name, method, url, favorite, position, source, created_at, updated_at
      FROM requests;
    DROP TABLE requests;
    ALTER TABLE requests_no_details RENAME TO requests;
    CREATE INDEX idx_requests_collection ON requests(collection_id);
    CREATE INDEX idx_requests_folder ON requests(folder_id);
    CREATE INDEX idx_requests_favorite ON requests(favorite);
  `,
};
