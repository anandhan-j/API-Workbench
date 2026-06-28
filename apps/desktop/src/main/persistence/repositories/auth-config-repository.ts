import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AppDatabase } from '../types';
import { authConfigs } from '../schema';
import type { AuthConfigRow } from '../schema';

export interface SaveAuthConfigRow {
  scope: string;
  scopeId: string;
  name: string;
  type: string;
  config: string;
  encrypted: boolean;
}

/** Data access for stored, reusable authentication credentials. */
export class AuthConfigRepository {
  constructor(private readonly db: AppDatabase) {}

  save(input: SaveAuthConfigRow): AuthConfigRow {
    const now = Date.now();
    const existing = this.db
      .select()
      .from(authConfigs)
      .where(
        and(
          eq(authConfigs.scope, input.scope),
          eq(authConfigs.scopeId, input.scopeId),
          eq(authConfigs.name, input.name),
        ),
      )
      .get();

    if (existing) {
      const next: AuthConfigRow = {
        ...existing,
        type: input.type,
        config: input.config,
        encrypted: input.encrypted,
        updatedAt: now,
      };
      this.db.update(authConfigs).set(next).where(eq(authConfigs.id, existing.id)).run();
      return next;
    }

    const row: AuthConfigRow = {
      id: randomUUID(),
      scope: input.scope,
      scopeId: input.scopeId,
      name: input.name,
      type: input.type,
      config: input.config,
      encrypted: input.encrypted,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(authConfigs).values(row).run();
    return row;
  }

  get(id: string): AuthConfigRow | undefined {
    return this.db.select().from(authConfigs).where(eq(authConfigs.id, id)).get();
  }

  listByScope(scope: string, scopeId: string): AuthConfigRow[] {
    return this.db
      .select()
      .from(authConfigs)
      .where(and(eq(authConfigs.scope, scope), eq(authConfigs.scopeId, scopeId)))
      .all();
  }

  delete(id: string): void {
    this.db.delete(authConfigs).where(eq(authConfigs.id, id)).run();
  }
}
