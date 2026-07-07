import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../types';
import { aiConversations } from '../schema';
import type { AiConversationRow } from '../schema';
import type { AiMessage } from '@shared/ai';

/** Data access for AI assistant conversations (ADR-0012). */
export class AiConversationRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Conversations most-recently-updated first. */
  list(): AiConversationRow[] {
    return this.db.select().from(aiConversations).orderBy(desc(aiConversations.updatedAt)).all();
  }

  get(id: string): AiConversationRow | undefined {
    return this.db.select().from(aiConversations).where(eq(aiConversations.id, id)).get();
  }

  create(title: string, messages: AiMessage[] = []): AiConversationRow {
    const now = Date.now();
    const row: AiConversationRow = {
      id: randomUUID(),
      title,
      messages,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(aiConversations).values(row).run();
    return row;
  }

  /** Replaces the transcript and bumps `updatedAt`. */
  setMessages(id: string, messages: AiMessage[]): void {
    this.db
      .update(aiConversations)
      .set({ messages, updatedAt: Date.now() })
      .where(eq(aiConversations.id, id))
      .run();
  }

  setTitle(id: string, title: string): void {
    this.db.update(aiConversations).set({ title }).where(eq(aiConversations.id, id)).run();
  }

  delete(id: string): void {
    this.db.delete(aiConversations).where(eq(aiConversations.id, id)).run();
  }
}
