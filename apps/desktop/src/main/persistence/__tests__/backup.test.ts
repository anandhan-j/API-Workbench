// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistenceService } from '../persistence-service';
import { PersistenceError } from '../types';
import type { DatabaseConnection } from '../connection';
import { createSqlJsConnection } from './sqljs-connection';

describe('backup & restore', () => {
  let conn: DatabaseConnection;
  let dir: string;
  let service: PersistenceService;

  beforeEach(async () => {
    conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-backup-'));
    service = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('restores data captured at backup time', () => {
    service.workspaces.create({ name: 'before-backup' });
    const backup = service.createBackup();
    expect(backup.schemaVersion).toBe(service.schemaVersion());
    expect(backup.sizeBytes).toBeGreaterThan(0);

    // mutate after the backup
    service.workspaces.create({ name: 'after-backup' });
    expect(service.workspaces.list()).toHaveLength(2);

    service.restoreBackup(backup.id);
    const names = service.workspaces.list().map((w) => w.name);
    expect(names).toEqual(['before-backup']);
  });

  it('takes a safety backup before restoring', () => {
    service.workspaces.create({ name: 'x' });
    const first = service.createBackup();
    const countBefore = service.listBackups().length;
    service.restoreBackup(first.id);
    expect(service.listBackups().length).toBe(countBefore + 1);
  });

  it('rejects a corrupted backup (checksum mismatch)', () => {
    service.workspaces.create({ name: 'x' });
    const backup = service.createBackup();
    // corrupt the data file
    const dataFile = readdirSync(dir).find((f) => f.endsWith('.sqlite'));
    expect(dataFile).toBeTruthy();
    const path = join(dir, dataFile as string);
    const bytes = readFileSync(path);
    bytes[20] = bytes[20] ^ 0xff;
    writeFileSync(path, bytes);

    expect(() => service.restoreBackup(backup.id)).toThrow(PersistenceError);
  });

  it('lists newest first and prunes old backups', () => {
    const a = service.createBackup();
    const b = service.createBackup();
    const list = service.listBackups();
    expect(list[0].createdAt).toBeGreaterThanOrEqual(list[list.length - 1].createdAt);
    expect(list.map((x) => x.id)).toEqual(expect.arrayContaining([a.id, b.id]));

    service.pruneBackups(1);
    expect(service.listBackups()).toHaveLength(1);
  });
});
