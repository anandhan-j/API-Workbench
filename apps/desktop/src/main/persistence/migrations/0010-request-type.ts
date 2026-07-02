import type { Migration } from './types';

/**
 * Adds `type` to `requests` (Phase 16, ADR-0009): the request-type discriminator
 * of the protocol-agnostic execution model. `'http'` for every request that
 * exists today (the default), or a fully-qualified plugin type
 * (`plugin:<pluginId>/<type>`). For non-HTTP requests the `method`/`url` columns
 * hold the provider's display summary (badge/target), so the tree and history
 * render without schema changes. `request_history` joins `requests` and needs
 * nothing. Must match `../schema.ts`.
 */
export const migration0010: Migration = {
  version: 10,
  name: 'request-type',
  up: `
    ALTER TABLE requests ADD COLUMN type TEXT NOT NULL DEFAULT 'http';
  `,
  // SQLite cannot drop a column on older engines; rebuild the table without it.
  down: `
    CREATE TABLE requests_no_type (
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
      updated_at    INTEGER NOT NULL,
      details       TEXT
    );
    INSERT INTO requests_no_type
      SELECT id, collection_id, folder_id, name, method, url, favorite, position, source, created_at, updated_at, details
      FROM requests;
    DROP TABLE requests;
    ALTER TABLE requests_no_type RENAME TO requests;
    CREATE INDEX idx_requests_collection ON requests(collection_id);
    CREATE INDEX idx_requests_folder ON requests(folder_id);
    CREATE INDEX idx_requests_favorite ON requests(favorite);
  `,
};
