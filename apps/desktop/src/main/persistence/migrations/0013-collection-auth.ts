import type { Migration } from './types';

/**
 * Adds `auth` to `collections`: the collection-level authorization config that
 * sits at the top of the inheritance chain. A request/folder set to inherit
 * walks up its folders and, if none carry a concrete config, falls back to the
 * collection's auth (null/inherit here resolves to no authorization). Holds a
 * serialized `WireAuthConfig` JSON blob or NULL. Must match `../schema.ts`.
 */
export const migration0013: Migration = {
  version: 13,
  name: 'collection-auth',
  up: `
    ALTER TABLE collections ADD COLUMN auth TEXT;
  `,
  // Plain DROP COLUMN (SQLite 3.35+): avoids a table rebuild, whose implicit
  // DROP-TABLE delete would cascade to every folder and request in the collection.
  down: `
    ALTER TABLE collections DROP COLUMN auth;
  `,
};
