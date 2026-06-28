import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BackupInfo } from '@shared/persistence';
import type { DatabaseSnapshotSource } from './snapshot';
import { PersistenceError } from './types';

const DATA_EXT = '.sqlite';
const META_EXT = '.json';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface BackupContext {
  /** Current applied schema version, stored with the backup for compatibility checks. */
  schemaVersion: number;
  /** Application version, recorded for diagnostics. */
  appVersion?: string;
}

/**
 * Creates and restores point-in-time backups of the database.
 *
 * A backup is a snapshot file plus a JSON sidecar holding its {@link BackupInfo}
 * (id, size, sha256 checksum, schema version). Restore verifies the checksum
 * before applying, and first takes an automatic safety backup of the current
 * state so a restore is itself recoverable (no data loss).
 */
export class BackupService {
  constructor(
    private readonly source: DatabaseSnapshotSource,
    private readonly backupDir: string,
  ) {
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true });
    }
  }

  create(context: BackupContext): BackupInfo {
    const bytes = this.source.snapshot();
    const id = randomUUID();
    const fileName = `backup-${Date.now()}-${id}${DATA_EXT}`;
    const info: BackupInfo = {
      id,
      fileName,
      createdAt: Date.now(),
      sizeBytes: bytes.byteLength,
      checksum: sha256(bytes),
      schemaVersion: context.schemaVersion,
      ...(context.appVersion ? { appVersion: context.appVersion } : {}),
    };
    writeFileSync(join(this.backupDir, fileName), bytes);
    writeFileSync(join(this.backupDir, fileName + META_EXT), JSON.stringify(info, null, 2));
    return info;
  }

  list(): BackupInfo[] {
    if (!existsSync(this.backupDir)) return [];
    return readdirSync(this.backupDir)
      .filter((f) => f.endsWith(DATA_EXT + META_EXT))
      .map((f) => JSON.parse(readFileSync(join(this.backupDir, f), 'utf8')) as BackupInfo)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Restores the database from the backup with the given id. Verifies the
   * checksum, takes a safety backup of the current state first, then applies.
   * Returns the safety backup created before the restore.
   */
  restore(id: string, context: BackupContext): BackupInfo {
    const info = this.list().find((b) => b.id === id);
    if (!info) throw new PersistenceError(`Backup not found: ${id}`);

    const dataPath = join(this.backupDir, info.fileName);
    if (!existsSync(dataPath)) {
      throw new PersistenceError(`Backup data file missing for ${id}: ${info.fileName}`);
    }
    const bytes = readFileSync(dataPath);
    if (sha256(bytes) !== info.checksum) {
      throw new PersistenceError(`Backup ${id} is corrupt (checksum mismatch)`);
    }

    const safety = this.create(context);
    this.source.restore(bytes);
    return safety;
  }

  /** Deletes a backup and its sidecar. */
  remove(id: string): void {
    const info = this.list().find((b) => b.id === id);
    if (!info) return;
    const dataPath = join(this.backupDir, info.fileName);
    const metaPath = dataPath + META_EXT;
    if (existsSync(dataPath)) rmSync(dataPath);
    if (existsSync(metaPath)) rmSync(metaPath);
  }

  /** Keeps the newest `keep` backups and removes the rest; returns removed count. */
  prune(keep: number): number {
    const all = this.list();
    const remove = all.slice(Math.max(0, keep));
    for (const info of remove) this.remove(info.id);
    return remove.length;
  }
}
