import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaveCredentialInput } from '@shared/auth';
import { invoke, isBridgeAvailable } from '../../lib/ipc';

/** React Query hooks for the stored-credentials management surface. */
export function useCredentials(scope: string | null | undefined, scopeId = '') {
  return useQuery({
    queryKey: ['credentials', scope ?? '', scopeId],
    queryFn: () => invoke('auth.list', { scope: scope as string, scopeId }),
    enabled: Boolean(scope) && isBridgeAvailable(),
  });
}

export function useAuthMutations(scope: string | null | undefined, scopeId = '') {
  const qc = useQueryClient();
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ['credentials', scope ?? '', scopeId] });
  return {
    save: useMutation({
      mutationFn: (input: SaveCredentialInput) => invoke('auth.save', input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => invoke('auth.delete', { id }),
      onSuccess: invalidate,
    }),
  };
}
