import { randomUUID } from 'node:crypto';
import { and, eq, max } from 'drizzle-orm';
import type { Folder } from '@shared/collection';
import type { AppDatabase } from '../types';
import { NotFoundError } from '../types';
import { folders } from '../schema';
import type { FolderRow } from '../schema';

function toDto(row: FolderRow): Folder {
  return {
    id: row.id,
    collectionId: row.collectionId,
    parentId: row.parentId,
    name: row.name,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Data access for folders within a collection. */
export class FolderRepository {
  constructor(private readonly db: AppDatabase) {}

  private nextPosition(collectionId: string): number {
    const row = this.db
      .select({ value: max(folders.position) })
      .from(folders)
      .where(eq(folders.collectionId, collectionId))
      .get();
    return (row?.value ?? -1) + 1;
  }

  create(input: { collectionId: string; parentId?: string | null; name: string }): Folder {
    const now = Date.now();
    const row: FolderRow = {
      id: randomUUID(),
      collectionId: input.collectionId,
      parentId: input.parentId ?? null,
      name: input.name,
      position: this.nextPosition(input.collectionId),
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(folders).values(row).run();
    return toDto(row);
  }

  findById(id: string): Folder | undefined {
    const row = this.db.select().from(folders).where(eq(folders.id, id)).get();
    return row ? toDto(row) : undefined;
  }

  get(id: string): Folder {
    const found = this.findById(id);
    if (!found) throw new NotFoundError('Folder', id);
    return found;
  }

  listByCollection(collectionId: string): Folder[] {
    return this.db
      .select()
      .from(folders)
      .where(eq(folders.collectionId, collectionId))
      .all()
      .map(toDto);
  }

  listChildren(collectionId: string, parentId: string | null): Folder[] {
    const condition =
      parentId === null
        ? and(eq(folders.collectionId, collectionId), eq(folders.parentId, '__never__'))
        : and(eq(folders.collectionId, collectionId), eq(folders.parentId, parentId));
    // Drizzle has no direct "IS NULL" via eq; handle root case separately.
    if (parentId === null) {
      return this.listByCollection(collectionId).filter((f) => f.parentId === null);
    }
    return this.db.select().from(folders).where(condition).all().map(toDto);
  }

  rename(id: string, name: string): Folder {
    const existing = this.get(id);
    const next: FolderRow = { ...existing, name, updatedAt: Date.now() };
    this.db.update(folders).set(next).where(eq(folders.id, id)).run();
    return toDto(next);
  }

  setParent(id: string, parentId: string | null): Folder {
    const existing = this.get(id);
    const next: FolderRow = { ...existing, parentId, updatedAt: Date.now() };
    this.db.update(folders).set(next).where(eq(folders.id, id)).run();
    return toDto(next);
  }

  delete(id: string): void {
    this.get(id);
    this.db.delete(folders).where(eq(folders.id, id)).run();
  }
}
