import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke, isBridgeAvailable } from '../../lib/ipc';

/** React Query hooks over the collection version-control IPC channels (Phase 7). */

export function useVersions(collectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['versions', collectionId ?? ''],
    queryFn: () => invoke('version.list', { collectionId: collectionId as string }),
    enabled: Boolean(collectionId) && isBridgeAvailable(),
  });
}

export function useVersionMutations(collectionId: string | null | undefined) {
  const qc = useQueryClient();
  const invalidateVersions = () =>
    void qc.invalidateQueries({ queryKey: ['versions', collectionId ?? ''] });

  return {
    snapshot: useMutation({
      mutationFn: (input: { collectionId: string; label?: string }) =>
        invoke('version.snapshot', input),
      onSuccess: invalidateVersions,
    }),
    restore: useMutation({
      mutationFn: (versionId: string) => invoke('version.restore', { versionId }),
      onSuccess: () => {
        invalidateVersions();
        void qc.invalidateQueries({ queryKey: ['tree'] });
        void qc.invalidateQueries({ queryKey: ['favorites'] });
      },
    }),
    diff: useMutation({
      mutationFn: (versionId: string) => invoke('version.diff', { versionId }),
    }),
  };
}
