import { eq } from 'drizzle-orm';
import type { Preference } from '@shared/persistence';
import type { AppDatabase } from '../types';
import { preferences } from '../schema';

/** Key/value application preferences with JSON-encoded values. */
export class PreferencesRepository {
  constructor(private readonly db: AppDatabase) {}

  get<T = unknown>(key: string): T | undefined {
    const row = this.db.select().from(preferences).where(eq(preferences.key, key)).get();
    return row ? (row.value as T) : undefined;
  }

  getOrDefault<T>(key: string, fallback: T): T {
    const value = this.get<T>(key);
    return value === undefined ? fallback : value;
  }

  set(key: string, value: unknown): void {
    const updatedAt = Date.now();
    this.db
      .insert(preferences)
      .values({ key, value, updatedAt })
      .onConflictDoUpdate({ target: preferences.key, set: { value, updatedAt } })
      .run();
  }

  list(): Preference[] {
    return this.db
      .select()
      .from(preferences)
      .all()
      .map((row) => ({ key: row.key, value: row.value, updatedAt: row.updatedAt }));
  }

  delete(key: string): void {
    this.db.delete(preferences).where(eq(preferences.key, key)).run();
  }
}
