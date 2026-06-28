import { desc, eq, max } from 'drizzle-orm';
import type { AppDatabase } from '../types';
import { NotFoundError } from '../types';
import { collectionVersions } from '../schema';
import type { CollectionVersionRow } from '../schema';

export interface CreateVersionRow {
  id: string;
  collectionId: string;
  number: number;
  label: string | null;
  checksum: string | null;
  createdAt: number;
  snapshot: string;
}

/** Data access for collection version snapshots. */
export class CollectionVersionRepository {
  constructor(private readonly db: AppDatabase) {}

  /** The next sequential version number for a collection (1-based). */
  nextNumber(collectionId: string): number {
    const row = this.db
      .select({ value: max(collectionVersions.number) })
      .from(collectionVersions)
      .where(eq(collectionVersions.collectionId, collectionId))
      .get();
    return (row?.value ?? 0) + 1;
  }

  create(row: CreateVersionRow): CollectionVersionRow {
    this.db.insert(collectionVersions).values(row).run();
    return row;
  }

  findById(id: string): CollectionVersionRow | undefined {
    return this.db.select().from(collectionVersions).where(eq(collectionVersions.id, id)).get();
  }

  get(id: string): CollectionVersionRow {
    const found = this.findById(id);
    if (!found) throw new NotFoundError('Version', id);
    return found;
  }

  /** Versions for a collection, newest first. */
  listByCollection(collectionId: string): CollectionVersionRow[] {
    return this.db
      .select()
      .from(collectionVersions)
      .where(eq(collectionVersions.collectionId, collectionId))
      .orderBy(desc(collectionVersions.number))
      .all();
  }

  deleteByCollection(collectionId: string): void {
    this.db.delete(collectionVersions).where(eq(collectionVersions.collectionId, collectionId)).run();
  }
}
