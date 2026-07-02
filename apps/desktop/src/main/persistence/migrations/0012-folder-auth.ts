import type { Migration } from './types';

/**
 * Adds `auth` to `folders`: the folder-level authorization config that requests
 * (and nested folders) can inherit. Holds a serialized `WireAuthConfig` JSON blob
 * or NULL. NULL means "inherit from parent" (the default for every folder that
 * exists today); a concrete config or `{ "type": "none" }` stops the inheritance
 * walk. Resolution happens in the main process at execution time. Must match
 * `../schema.ts`.
 */
export const migration0012: Migration = {
  version: 12,
  name: 'folder-auth',
  up: `
    ALTER TABLE folders ADD COLUMN auth TEXT;
  `,
  // Plain DROP COLUMN (SQLite 3.35+): avoids a table rebuild, whose implicit
  // DROP-TABLE delete would cascade to child folders/requests via the FKs.
  down: `
    ALTER TABLE folders DROP COLUMN auth;
  `,
};
