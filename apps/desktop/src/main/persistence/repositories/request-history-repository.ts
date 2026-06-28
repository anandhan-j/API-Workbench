import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { HttpMethod, RequestHistoryEntry } from '@shared/collection';
import type { AppDatabase } from '../types';
import { requestHistory, requests } from '../schema';

/** Records and lists recently opened requests. */
export class RequestHistoryRepository {
  constructor(private readonly db: AppDatabase) {}

  record(requestId: string, openedAt: number = Date.now()): void {
    this.db
      .insert(requestHistory)
      .values({ id: randomUUID(), requestId, openedAt })
      .run();
  }

  /** Most-recent-first, de-duplicated by request, joined with request details. */
  list(limit = 20): RequestHistoryEntry[] {
    const rows = this.db
      .select({
        id: requestHistory.id,
        requestId: requestHistory.requestId,
        openedAt: requestHistory.openedAt,
        name: requests.name,
        method: requests.method,
        url: requests.url,
      })
      .from(requestHistory)
      .innerJoin(requests, eq(requestHistory.requestId, requests.id))
      .orderBy(desc(requestHistory.openedAt))
      .all();

    const seen = new Set<string>();
    const result: RequestHistoryEntry[] = [];
    for (const row of rows) {
      if (seen.has(row.requestId)) continue;
      seen.add(row.requestId);
      result.push({
        id: row.id,
        requestId: row.requestId,
        name: row.name,
        method: row.method as HttpMethod,
        url: row.url,
        openedAt: row.openedAt,
      });
      if (result.length >= limit) break;
    }
    return result;
  }

  clear(): void {
    this.db.delete(requestHistory).run();
  }
}
