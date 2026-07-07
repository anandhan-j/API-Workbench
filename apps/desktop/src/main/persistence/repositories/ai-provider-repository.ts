import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../types';
import { aiProviders } from '../schema';
import type { AiProviderRow } from '../schema';

export interface UpsertAiProviderRow {
  id?: string;
  kind: string;
  label: string;
  baseUrl: string | null;
  defaultModel: string;
  /** Extra HTTP headers for gateways; null = none. */
  headers: Record<string, string> | null;
  /** Encrypted (or plaintext-fallback) key blob; null leaves any existing key untouched on update. */
  apiKey: string | null;
  encrypted: boolean;
}

/** Data access for AI assistant provider configs (ADR-0012). */
export class AiProviderRepository {
  constructor(private readonly db: AppDatabase) {}

  list(): AiProviderRow[] {
    return this.db.select().from(aiProviders).orderBy(aiProviders.createdAt).all();
  }

  get(id: string): AiProviderRow | undefined {
    return this.db.select().from(aiProviders).where(eq(aiProviders.id, id)).get();
  }

  create(input: UpsertAiProviderRow): AiProviderRow {
    const now = Date.now();
    const row: AiProviderRow = {
      id: randomUUID(),
      kind: input.kind,
      label: input.label,
      baseUrl: input.baseUrl,
      defaultModel: input.defaultModel,
      headers: input.headers,
      apiKey: input.apiKey,
      encrypted: input.encrypted,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(aiProviders).values(row).run();
    return row;
  }

  /**
   * Updates metadata and, when `apiKey` is non-null, the stored key. A null
   * `apiKey` leaves the existing key and its `encrypted` flag untouched, so
   * re-saving provider metadata never clears the credential.
   */
  update(id: string, input: UpsertAiProviderRow): AiProviderRow {
    const existing = this.get(id);
    if (!existing) throw new Error(`AI provider not found: ${id}`);
    const next: AiProviderRow = {
      ...existing,
      kind: input.kind,
      label: input.label,
      baseUrl: input.baseUrl,
      defaultModel: input.defaultModel,
      headers: input.headers,
      ...(input.apiKey !== null ? { apiKey: input.apiKey, encrypted: input.encrypted } : {}),
      updatedAt: Date.now(),
    };
    this.db.update(aiProviders).set(next).where(eq(aiProviders.id, id)).run();
    return next;
  }

  delete(id: string): void {
    this.db.delete(aiProviders).where(eq(aiProviders.id, id)).run();
  }
}
