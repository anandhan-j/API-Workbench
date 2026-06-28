import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { VariableScope } from '@shared/variable';
import type { AppDatabase } from '../types';
import { variables } from '../schema';
import type { VariableRow } from '../schema';

export interface VariableUpsertInput {
  scope: VariableScope;
  /** Empty string for the global scope. */
  scopeId: string;
  key: string;
  value: string;
  secret: boolean;
  encrypted: boolean;
}

/**
 * Data access for scoped variables. `scopeId` is always a string ('' for
 * global) so the (scope, scope_id, key) unique index is honoured uniformly.
 */
export class VariableRepository {
  constructor(private readonly db: AppDatabase) {}

  listByScope(scope: VariableScope, scopeId: string): VariableRow[] {
    return this.db
      .select()
      .from(variables)
      .where(and(eq(variables.scope, scope), eq(variables.scopeId, scopeId)))
      .all();
  }

  get(scope: VariableScope, scopeId: string, key: string): VariableRow | undefined {
    return this.db
      .select()
      .from(variables)
      .where(
        and(eq(variables.scope, scope), eq(variables.scopeId, scopeId), eq(variables.key, key)),
      )
      .get();
  }

  upsert(input: VariableUpsertInput): VariableRow {
    const existing = this.get(input.scope, input.scopeId, input.key);
    const now = Date.now();
    if (existing) {
      const next: VariableRow = {
        ...existing,
        value: input.value,
        secret: input.secret,
        encrypted: input.encrypted,
        updatedAt: now,
      };
      this.db.update(variables).set(next).where(eq(variables.id, existing.id)).run();
      return next;
    }
    const row: VariableRow = {
      id: randomUUID(),
      scope: input.scope,
      scopeId: input.scopeId,
      key: input.key,
      value: input.value,
      secret: input.secret,
      encrypted: input.encrypted,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(variables).values(row).run();
    return row;
  }

  deleteOne(scope: VariableScope, scopeId: string, key: string): void {
    this.db
      .delete(variables)
      .where(
        and(eq(variables.scope, scope), eq(variables.scopeId, scopeId), eq(variables.key, key)),
      )
      .run();
  }

  deleteScope(scope: VariableScope, scopeId: string): void {
    this.db
      .delete(variables)
      .where(and(eq(variables.scope, scope), eq(variables.scopeId, scopeId)))
      .run();
  }
}
