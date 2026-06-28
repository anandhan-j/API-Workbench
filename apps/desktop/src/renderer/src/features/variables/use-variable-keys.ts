import { useQuery } from '@tanstack/react-query';
import type { VariableContext } from '@shared/variable';
import { invoke, isBridgeAvailable } from '../../lib/ipc';
import { useActiveSelection } from '../workspaces/use-workspaces';

/**
 * The scoped variables available for autocomplete, resolved for the current
 * active workspace (plus any extra context the caller supplies). Returns `[]`
 * when the bridge is unavailable so fields degrade gracefully.
 */
export function useVariableKeys(extra: VariableContext = {}) {
  const active = useActiveSelection();
  const context: VariableContext = {
    ...(active.data?.workspaceId ? { workspaceId: active.data.workspaceId } : {}),
    ...extra,
  };
  const query = useQuery({
    queryKey: ['variableKeys', context],
    queryFn: () => invoke('variable.resolvedKeys', { context }),
    enabled: isBridgeAvailable(),
    staleTime: 5_000,
  });
  return query.data ?? [];
}
