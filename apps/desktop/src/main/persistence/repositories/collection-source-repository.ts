import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../types';
import { collectionSources } from '../schema';
import type { CollectionSourceRow } from '../schema';

export interface CollectionSourceInput {
  collectionId: string;
  specVersion: string;
  title: string;
  baseUrl: string;
  checksum: string;
  /** When provided, the remote URL the spec came from. `undefined` leaves the
   *  stored URL unchanged on update (e.g. a text-based sync). */
  sourceUrl?: string | null;
}

/** Records the OpenAPI spec a collection was last imported or synced from. */
export class CollectionSourceRepository {
  constructor(private readonly db: AppDatabase) {}

  get(collectionId: string): CollectionSourceRow | undefined {
    return this.db
      .select()
      .from(collectionSources)
      .where(eq(collectionSources.collectionId, collectionId))
      .get();
  }

  upsert(input: CollectionSourceInput): void {
    const now = Date.now();
    const row: CollectionSourceRow = {
      collectionId: input.collectionId,
      specVersion: input.specVersion,
      title: input.title,
      baseUrl: input.baseUrl,
      checksum: input.checksum,
      sourceUrl: input.sourceUrl ?? null,
      updatedAt: now,
    };
    this.db
      .insert(collectionSources)
      .values(row)
      .onConflictDoUpdate({
        target: collectionSources.collectionId,
        set: {
          specVersion: row.specVersion,
          title: row.title,
          baseUrl: row.baseUrl,
          checksum: row.checksum,
          updatedAt: row.updatedAt,
          // Only overwrite the stored URL when a new one is supplied.
          ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
        },
      })
      .run();
  }
}
