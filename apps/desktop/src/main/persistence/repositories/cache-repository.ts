import { eq, isNotNull, lte, and } from 'drizzle-orm';
import type { AppDatabase } from '../types';
import { cacheEntries } from '../schema';

/**
 * Local key/value cache with optional time-to-live. Expired entries are treated
 * as absent and removed lazily on read, and can be pruned in bulk.
 */
export class CacheRepository {
  constructor(private readonly db: AppDatabase) {}

  set(key: string, value: string, ttlMs?: number, now: number = Date.now()): void {
    const expiresAt = ttlMs !== undefined ? now + ttlMs : null;
    this.db
      .insert(cacheEntries)
      .values({ key, value, expiresAt, createdAt: now })
      .onConflictDoUpdate({ target: cacheEntries.key, set: { value, expiresAt, createdAt: now } })
      .run();
  }

  get(key: string, now: number = Date.now()): string | undefined {
    const row = this.db.select().from(cacheEntries).where(eq(cacheEntries.key, key)).get();
    if (!row) return undefined;
    if (row.expiresAt !== null && row.expiresAt <= now) {
      this.delete(key);
      return undefined;
    }
    return row.value;
  }

  has(key: string, now: number = Date.now()): boolean {
    return this.get(key, now) !== undefined;
  }

  delete(key: string): void {
    this.db.delete(cacheEntries).where(eq(cacheEntries.key, key)).run();
  }

  /** Removes all expired entries as of `now`; returns the number removed. */
  prune(now: number = Date.now()): number {
    const expired = this.db
      .select({ key: cacheEntries.key })
      .from(cacheEntries)
      .where(and(isNotNull(cacheEntries.expiresAt), lte(cacheEntries.expiresAt, now)))
      .all();
    for (const { key } of expired) this.delete(key);
    return expired.length;
  }

  clear(): void {
    this.db.delete(cacheEntries).run();
  }
}
