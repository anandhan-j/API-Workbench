// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { applyMigrations, currentVersion, rollbackTo } from '../migrator';
import { MIGRATIONS } from '../migrations';
import { PersistenceError } from '../types';
import type { DatabaseConnection } from '../connection';
import { createSqlJsConnection } from './sqljs-connection';

function tableNames(conn: DatabaseConnection): string[] {
  const rows = conn.db.all(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  ) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

describe('migrator', () => {
  let conn: DatabaseConnection;

  beforeEach(async () => {
    conn = await createSqlJsConnection();
  });

  it('applies all migrations and records the version', () => {
    const applied = applyMigrations(conn.db);
    expect(applied).toEqual(MIGRATIONS.map((m) => m.version));
    expect(currentVersion(conn.db)).toBe(MIGRATIONS.length);
    const tables = tableNames(conn);
    expect(tables).toEqual(
      expect.arrayContaining(['workspaces', 'projects', 'preferences', 'cache_entries']),
    );
  });

  it('is idempotent — re-running applies nothing', () => {
    applyMigrations(conn.db);
    const second = applyMigrations(conn.db);
    expect(second).toEqual([]);
    expect(currentVersion(conn.db)).toBe(MIGRATIONS.length);
  });

  it('rejects a tampered (checksum-mismatched) migration', () => {
    applyMigrations(conn.db);
    const tampered = [{ ...MIGRATIONS[0], up: MIGRATIONS[0].up + '\n-- changed' }];
    expect(() => applyMigrations(conn.db, tampered)).toThrow(PersistenceError);
  });

  it('rolls a failed migration back without leaving partial tables', () => {
    const bad = [
      {
        version: 1,
        name: 'bad',
        up: 'CREATE TABLE good (id INTEGER);\nCREATE TABLE good (id INTEGER);', // duplicate -> fails
        down: 'DROP TABLE IF EXISTS good;',
      },
    ];
    expect(() => applyMigrations(conn.db, bad)).toThrow(PersistenceError);
    expect(tableNames(conn)).not.toContain('good');
    expect(currentVersion(conn.db)).toBe(0);
  });

  it('reverts migrations down to a target version', () => {
    applyMigrations(conn.db);
    const reverted = rollbackTo(conn.db, 0);
    expect(reverted).toEqual([...MIGRATIONS].map((m) => m.version).reverse());
    expect(currentVersion(conn.db)).toBe(0);
    expect(tableNames(conn)).not.toContain('workspaces');
  });
});
