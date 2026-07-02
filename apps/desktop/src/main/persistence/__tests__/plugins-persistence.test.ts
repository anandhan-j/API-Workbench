// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PluginManifest } from '@shared/plugins';
import { applyMigrations, currentVersion, rollbackTo } from '../migrator';
import { MIGRATIONS } from '../migrations';
import { PluginRepository } from '../repositories/plugin-repository';
import { PluginStorageRepository } from '../repositories/plugin-storage-repository';
import type { DatabaseConnection } from '../connection';
import { createSqlJsConnection } from './sqljs-connection';

function tableNames(conn: DatabaseConnection): string[] {
  const rows = conn.db.all(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  ) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function requestColumns(conn: DatabaseConnection): string[] {
  const rows = conn.db.all(sql`PRAGMA table_info(requests)`) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

function manifest(id: string, version = '1.0.0'): PluginManifest {
  return {
    manifestVersion: 1,
    id,
    name: `Plugin ${id}`,
    version,
    main: 'dist/index.cjs',
    engines: { sdk: '^1.0.0' },
    capabilities: [],
    contributes: { nodes: [], requestTypes: [], authProviders: [], importers: [] },
  };
}

describe('migrations 0010 (request type) and 0011 (plugins)', () => {
  let conn: DatabaseConnection;

  beforeEach(async () => {
    conn = await createSqlJsConnection();
  });

  it('0010 up adds the type column defaulting existing rows to http', () => {
    applyMigrations(conn.db, MIGRATIONS.slice(0, 9));
    conn.db.run(sql`
      INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('w', 'W', 1, 1);
    `);
    conn.db.run(sql`
      INSERT INTO projects (id, workspace_id, name, created_at, updated_at) VALUES ('p', 'w', 'P', 1, 1);
    `);
    conn.db.run(sql`
      INSERT INTO collections (id, project_id, name, created_at, updated_at)
      VALUES ('c', 'p', 'C', 1, 1);
    `);
    conn.db.run(sql`
      INSERT INTO requests (id, collection_id, name, method, url, favorite, position, created_at, updated_at)
      VALUES ('r', 'c', 'R', 'GET', 'https://x', 0, 0, 1, 1);
    `);

    applyMigrations(conn.db, MIGRATIONS.slice(0, 10));
    expect(requestColumns(conn)).toContain('type');
    const rows = conn.db.all(sql`SELECT type FROM requests WHERE id = 'r'`) as Array<{
      type: string;
    }>;
    expect(rows[0]?.type).toBe('http');
  });

  it('0010 down rebuilds requests without the column, preserving rows and indexes', () => {
    applyMigrations(conn.db);
    conn.db.run(sql`
      INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('w', 'W', 1, 1);
    `);
    conn.db.run(sql`
      INSERT INTO projects (id, workspace_id, name, created_at, updated_at) VALUES ('p', 'w', 'P', 1, 1);
    `);
    conn.db.run(sql`
      INSERT INTO collections (id, project_id, name, created_at, updated_at)
      VALUES ('c', 'p', 'C', 1, 1);
    `);
    conn.db.run(sql`
      INSERT INTO requests (id, collection_id, name, method, url, favorite, position, created_at, updated_at, type)
      VALUES ('r', 'c', 'R', 'GET', 'https://x', 0, 0, 1, 1, 'plugin:com.acme.x/echo');
    `);

    rollbackTo(conn.db, 9);
    expect(currentVersion(conn.db)).toBe(9);
    expect(requestColumns(conn)).not.toContain('type');
    const rows = conn.db.all(sql`SELECT id, method, url FROM requests`) as Array<{
      id: string;
      method: string;
      url: string;
    }>;
    expect(rows).toEqual([{ id: 'r', method: 'GET', url: 'https://x' }]);
    const indexes = conn.db.all(
      sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'requests'`,
    ) as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toEqual(
      expect.arrayContaining(['idx_requests_collection', 'idx_requests_folder', 'idx_requests_favorite']),
    );
  });

  it('0011 up creates the plugin tables; down drops them', () => {
    applyMigrations(conn.db);
    expect(tableNames(conn)).toEqual(expect.arrayContaining(['plugins', 'plugin_storage']));

    rollbackTo(conn.db, 10);
    const tables = tableNames(conn);
    expect(tables).not.toContain('plugins');
    expect(tables).not.toContain('plugin_storage');
    expect(currentVersion(conn.db)).toBe(10);
  });
});

describe('PluginRepository', () => {
  let conn: DatabaseConnection;
  let repo: PluginRepository;

  beforeEach(async () => {
    conn = await createSqlJsConnection();
    applyMigrations(conn.db);
    repo = new PluginRepository(conn.db);
  });

  it('save inserts a new row with defaults and echoes it back', () => {
    const row = repo.save({
      manifest: manifest('com.acme.a'),
      grantedCapabilities: ['network'],
      installPath: '/plugins/com.acme.a',
      devMode: false,
    });
    expect(row).toMatchObject({
      id: 'com.acme.a',
      name: 'Plugin com.acme.a',
      version: '1.0.0',
      enabled: true,
      grantedCapabilities: ['network'],
      devMode: false,
    });
    expect(repo.get('com.acme.a')).toEqual(row);
    expect(row.installedAt).toBeGreaterThan(0);
  });

  it('get returns undefined for unknown ids', () => {
    expect(repo.get('com.acme.none')).toBeUndefined();
  });

  it('upgrade replaces the row but preserves enabled and installedAt', () => {
    const first = repo.save({
      manifest: manifest('com.acme.u'),
      grantedCapabilities: [],
      installPath: '/p1',
      devMode: false,
    });
    repo.setEnabled('com.acme.u', false);

    const second = repo.save({
      manifest: manifest('com.acme.u', '2.0.0'),
      grantedCapabilities: ['variables:read'],
      installPath: '/p2',
      devMode: true,
    });
    expect(second.version).toBe('2.0.0');
    expect(second.enabled).toBe(false); // preserved from the disabled install
    expect(second.installedAt).toBe(first.installedAt);
    expect(second.grantedCapabilities).toEqual(['variables:read']);
    expect(repo.list()).toHaveLength(1);
    expect(repo.get('com.acme.u')?.manifest.version).toBe('2.0.0');
  });

  it('setEnabled toggles the flag and bumps updatedAt', () => {
    repo.save({
      manifest: manifest('com.acme.t'),
      grantedCapabilities: [],
      installPath: '/p',
      devMode: false,
    });
    repo.setEnabled('com.acme.t', false);
    expect(repo.get('com.acme.t')?.enabled).toBe(false);
    repo.setEnabled('com.acme.t', true);
    expect(repo.get('com.acme.t')?.enabled).toBe(true);
  });

  it('list returns every saved plugin; delete removes one', () => {
    repo.save({
      manifest: manifest('com.acme.one'),
      grantedCapabilities: [],
      installPath: '/1',
      devMode: false,
    });
    repo.save({
      manifest: manifest('com.acme.two'),
      grantedCapabilities: [],
      installPath: '/2',
      devMode: false,
    });
    expect(repo.list().map((r) => r.id).sort()).toEqual(['com.acme.one', 'com.acme.two']);

    repo.delete('com.acme.one');
    expect(repo.get('com.acme.one')).toBeUndefined();
    expect(repo.list().map((r) => r.id)).toEqual(['com.acme.two']);
  });
});

describe('PluginStorageRepository', () => {
  let conn: DatabaseConnection;
  let plugins: PluginRepository;
  let storage: PluginStorageRepository;

  beforeEach(async () => {
    conn = await createSqlJsConnection();
    applyMigrations(conn.db);
    plugins = new PluginRepository(conn.db);
    storage = new PluginStorageRepository(conn.db);
    plugins.save({
      manifest: manifest('com.acme.s'),
      grantedCapabilities: [],
      installPath: '/p',
      devMode: false,
    });
  });

  it('get returns undefined for a missing key', () => {
    expect(storage.get('com.acme.s', 'nope')).toBeUndefined();
  });

  it('set inserts and get round-trips, per plugin', () => {
    plugins.save({
      manifest: manifest('com.acme.other'),
      grantedCapabilities: [],
      installPath: '/o',
      devMode: false,
    });
    storage.set('com.acme.s', 'k', 'v1');
    storage.set('com.acme.other', 'k', 'other');
    expect(storage.get('com.acme.s', 'k')).toBe('v1');
    expect(storage.get('com.acme.other', 'k')).toBe('other');
  });

  it('set updates an existing key in place', () => {
    storage.set('com.acme.s', 'k', 'v1');
    storage.set('com.acme.s', 'k', 'v2');
    expect(storage.get('com.acme.s', 'k')).toBe('v2');
    expect(storage.countKeys('com.acme.s')).toBe(1);
  });

  it('delete removes a single key', () => {
    storage.set('com.acme.s', 'a', '1');
    storage.set('com.acme.s', 'b', '2');
    storage.delete('com.acme.s', 'a');
    expect(storage.get('com.acme.s', 'a')).toBeUndefined();
    expect(storage.get('com.acme.s', 'b')).toBe('2');
  });

  it('countKeys counts only the given plugin', () => {
    expect(storage.countKeys('com.acme.s')).toBe(0);
    storage.set('com.acme.s', 'a', '1');
    storage.set('com.acme.s', 'b', '2');
    expect(storage.countKeys('com.acme.s')).toBe(2);
  });

  it('deleteAll wipes a plugin storage', () => {
    storage.set('com.acme.s', 'a', '1');
    storage.set('com.acme.s', 'b', '2');
    storage.deleteAll('com.acme.s');
    expect(storage.countKeys('com.acme.s')).toBe(0);
  });

  it('cascades on plugin row deletion', () => {
    storage.set('com.acme.s', 'a', '1');
    storage.set('com.acme.s', 'b', '2');
    plugins.delete('com.acme.s');
    expect(storage.countKeys('com.acme.s')).toBe(0);
  });
});
