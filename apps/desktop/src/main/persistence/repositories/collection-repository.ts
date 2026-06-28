import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Collection } from '@shared/collection';
import type { AppDatabase } from '../types';
import { NotFoundError } from '../types';
import { collections } from '../schema';
import type { CollectionRow } from '../schema';

function toDto(row: CollectionRow): Collection {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Data access for collections. */
export class CollectionRepository {
  constructor(private readonly db: AppDatabase) {}

  create(input: { projectId: string; name: string }): Collection {
    const now = Date.now();
    const row: CollectionRow = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(collections).values(row).run();
    return toDto(row);
  }

  findById(id: string): Collection | undefined {
    const row = this.db.select().from(collections).where(eq(collections.id, id)).get();
    return row ? toDto(row) : undefined;
  }

  get(id: string): Collection {
    const found = this.findById(id);
    if (!found) throw new NotFoundError('Collection', id);
    return found;
  }

  listByProject(projectId: string): Collection[] {
    return this.db
      .select()
      .from(collections)
      .where(eq(collections.projectId, projectId))
      .all()
      .map(toDto);
  }

  rename(id: string, name: string): Collection {
    const existing = this.get(id);
    const next: CollectionRow = { ...existing, name, updatedAt: Date.now() };
    this.db.update(collections).set(next).where(eq(collections.id, id)).run();
    return toDto(next);
  }

  delete(id: string): void {
    this.get(id);
    this.db.delete(collections).where(eq(collections.id, id)).run();
  }
}
