import type { Migration } from './types';

/**
 * Adds plugin persistence (Phase 16, ADR-0007): `plugins` holds each installed
 * plugin's identity, enablement, the capabilities the user granted at install,
 * where its files live, and a JSON snapshot of its validated manifest (the
 * renderer's contribution source, so listing needs no file reads).
 * `plugin_storage` is the per-plugin key/value store exposed to plugin code as
 * its only persistence (quota-enforced in the capability broker). Must match
 * `../schema.ts`.
 */
export const migration0011: Migration = {
  version: 11,
  name: 'plugins',
  up: `
    CREATE TABLE plugins (
      id                   TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      version              TEXT NOT NULL,
      enabled              INTEGER NOT NULL DEFAULT 1,
      granted_capabilities TEXT NOT NULL DEFAULT '[]',
      install_path         TEXT NOT NULL,
      dev_mode             INTEGER NOT NULL DEFAULT 0,
      manifest             TEXT NOT NULL,
      installed_at         INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL
    );

    CREATE TABLE plugin_storage (
      plugin_id  TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (plugin_id, key)
    );
  `,
  down: `
    DROP TABLE IF EXISTS plugin_storage;
    DROP TABLE IF EXISTS plugins;
  `,
};
