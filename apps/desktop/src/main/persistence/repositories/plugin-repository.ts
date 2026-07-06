import { eq } from 'drizzle-orm';
import type { PluginManifest } from '@shared/plugins';
import type { AppDatabase } from '../types';
import { plugins } from '../schema';
import type { PluginRow } from '../schema';

export interface InstallPluginRow {
  manifest: PluginManifest;
  grantedCapabilities: string[];
  installPath: string;
  devMode: boolean;
}

/** Data access for installed plugins (Phase 16). */
export class PluginRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Inserts a plugin, or replaces an existing install of the same id (upgrade). */
  save(input: InstallPluginRow): PluginRow {
    const now = Date.now();
    const existing = this.get(input.manifest.id);
    const row: PluginRow = {
      id: input.manifest.id,
      name: input.manifest.name,
      version: input.manifest.version,
      enabled: existing?.enabled ?? true,
      grantedCapabilities: input.grantedCapabilities,
      installPath: input.installPath,
      devMode: input.devMode,
      manifest: input.manifest,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
    };
    if (existing) {
      this.db.update(plugins).set(row).where(eq(plugins.id, row.id)).run();
    } else {
      this.db.insert(plugins).values(row).run();
    }
    return row;
  }

  get(id: string): PluginRow | undefined {
    return this.db.select().from(plugins).where(eq(plugins.id, id)).get();
  }

  list(): PluginRow[] {
    return this.db.select().from(plugins).all();
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db
      .update(plugins)
      .set({ enabled, updatedAt: Date.now() })
      .where(eq(plugins.id, id))
      .run();
  }

  delete(id: string): void {
    this.db.delete(plugins).where(eq(plugins.id, id)).run();
  }
}
