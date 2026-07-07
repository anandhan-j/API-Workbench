import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AiDataKind } from '@shared/ai';
import { isBridgeAvailable, onAiDataChanged } from '../../lib/ipc';

/**
 * React Query keys to invalidate for each data domain the assistant can change.
 * Mirrors the invalidation the app's own mutations do (see use-collections /
 * use-workflows / variables hooks), so an AI edit refreshes the same views.
 */
const KEYS_BY_KIND: Record<AiDataKind, string[][]> = {
  collections: [
    ['collections'],
    ['tree'],
    ['favorites'],
    ['history'],
    ['request'],
    ['folder'],
    ['collection'],
  ],
  workflows: [['workflows'], ['workflow']],
  variables: [['variables'], ['variableKeys'], ['usedVarValues']],
};

const subscribedClients = new WeakSet<QueryClient>();

/**
 * Refetches views the AI assistant edits (ADR-0012). The assistant mutates app
 * data in the main process, so the renderer's caches don't know to refresh;
 * this listens for `ai.dataChanged` and invalidates the affected query keys, so
 * new requests / folders / workflows / variables appear immediately instead of
 * only after switching pages. One app-lifetime subscription per query client
 * (mirrors the workflows.changed / plugins.changed pattern).
 */
export function useAiDataSync(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isBridgeAvailable() || subscribedClients.has(qc)) return;
    subscribedClients.add(qc);
    onAiDataChanged((event) => {
      const seen = new Set<string>();
      for (const kind of event.kinds) {
        for (const queryKey of KEYS_BY_KIND[kind] ?? []) {
          const dedupe = queryKey.join('|');
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          void qc.invalidateQueries({ queryKey });
        }
      }
    });
  }, [qc]);
}
