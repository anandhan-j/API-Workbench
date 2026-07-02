import { and, eq, count } from 'drizzle-orm';
import type { AppDatabase } from '../types';
import { pluginStorage } from '../schema';

/**
 * Per-plugin key/value storage (Phase 16) — the only persistence surface
 * exposed to plugin code, quota-enforced by the capability broker.
 */
export class PluginStorageRepository {
  constructor(private readonly db: AppDatabase) {}

  get(pluginId: string, key: string): string | undefined {
    return this.db
      .select()
      .from(pluginStorage)
      .where(and(eq(pluginStorage.pluginId, pluginId), eq(pluginStorage.key, key)))
      .get()?.value;
  }

  set(pluginId: string, key: string, value: string): void {
    const now = Date.now();
    const existing = this.get(pluginId, key);
    if (existing !== undefined) {
      this.db
        .update(pluginStorage)
        .set({ value, updatedAt: now })
        .where(and(eq(pluginStorage.pluginId, pluginId), eq(pluginStorage.key, key)))
        .run();
      return;
    }
    this.db.insert(pluginStorage).values({ pluginId, key, value, updatedAt: now }).run();
  }

  delete(pluginId: string, key: string): void {
    this.db
      .delete(pluginStorage)
      .where(and(eq(pluginStorage.pluginId, pluginId), eq(pluginStorage.key, key)))
      .run();
  }

  /** Number of keys a plugin currently stores (quota checks). */
  countKeys(pluginId: string): number {
    const row = this.db
      .select({ value: count() })
      .from(pluginStorage)
      .where(eq(pluginStorage.pluginId, pluginId))
      .get();
    return row?.value ?? 0;
  }

  /** Removes every value a plugin stored (uninstall). */
  deleteAll(pluginId: string): void {
    this.db.delete(pluginStorage).where(eq(pluginStorage.pluginId, pluginId)).run();
  }
}
