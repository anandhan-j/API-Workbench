import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SyncRequest } from '@shared/sync';
import { invoke } from '../../lib/ipc';

/** Mutation hook for synchronizing a collection against a changed OpenAPI spec. */
export function useSync(projectId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: SyncRequest) => invoke('openapi.sync', request),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tree'] });
      void qc.invalidateQueries({ queryKey: ['favorites'] });
      void qc.invalidateQueries({ queryKey: ['collections', projectId ?? ''] });
      // Refresh any open request editor so synced headers/params/body show.
      void qc.invalidateQueries({ queryKey: ['request'] });
    },
  });
}
