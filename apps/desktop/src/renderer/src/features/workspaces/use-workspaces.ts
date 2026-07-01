import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateWorkspaceInput, CreateProjectInput } from '@shared/persistence';
import type { WorkspaceExport } from '@shared/workspace';
import { invoke, isBridgeAvailable } from '../../lib/ipc';

/**
 * React Query hooks over the workspace-management IPC channels. Server state
 * lives in the main process; these hooks own caching and invalidation. Queries
 * are disabled when the Electron bridge is unavailable (plain-browser dev/tests
 * without a fake bridge).
 */

const keys = {
  workspaces: ['workspaces'] as const,
  active: ['activeSelection'] as const,
  recent: ['recentProjects'] as const,
  detail: (id: string) => ['workspace', id] as const,
};

export function useWorkspaces() {
  return useQuery({
    queryKey: keys.workspaces,
    queryFn: () => invoke('workspace.list', {}),
    enabled: isBridgeAvailable(),
  });
}

export function useActiveSelection() {
  return useQuery({
    queryKey: keys.active,
    queryFn: () => invoke('workspace.getActive', {}),
    enabled: isBridgeAvailable(),
  });
}

export function useWorkspaceDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => invoke('workspace.detail', { id: id as string }),
    enabled: Boolean(id) && isBridgeAvailable(),
  });
}

export function useRecentProjects(limit = 10) {
  return useQuery({
    queryKey: keys.recent,
    queryFn: () => invoke('project.recent', { limit }),
    enabled: isBridgeAvailable(),
  });
}

export function useWorkspaceMutations() {
  const qc = useQueryClient();
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: keys.workspaces });
    void qc.invalidateQueries({ queryKey: keys.active });
    void qc.invalidateQueries({ queryKey: keys.recent });
    void qc.invalidateQueries({ queryKey: ['workspace'] });
  };

  return {
    createWorkspace: useMutation({
      mutationFn: (input: CreateWorkspaceInput) => invoke('workspace.create', input),
      onSuccess: invalidateAll,
    }),
    renameWorkspace: useMutation({
      mutationFn: (input: { id: string; name: string }) => invoke('workspace.rename', input),
      onSuccess: invalidateAll,
    }),
    deleteWorkspace: useMutation({
      mutationFn: (id: string) => invoke('workspace.delete', { id }),
      onSuccess: invalidateAll,
    }),
    setActiveWorkspace: useMutation({
      mutationFn: (id: string) => invoke('workspace.setActive', { id }),
      onSuccess: invalidateAll,
    }),
    createProject: useMutation({
      mutationFn: (input: CreateProjectInput) => invoke('project.create', input),
      onSuccess: invalidateAll,
    }),
    renameProject: useMutation({
      mutationFn: (input: { id: string; name: string }) => invoke('project.rename', input),
      onSuccess: invalidateAll,
    }),
    openProject: useMutation({
      mutationFn: (id: string) => invoke('project.open', { id }),
      onSuccess: invalidateAll,
    }),
    closeProject: useMutation({
      mutationFn: () => invoke('project.close', {}),
      onSuccess: invalidateAll,
    }),
    deleteProject: useMutation({
      mutationFn: (id: string) => invoke('project.delete', { id }),
      onSuccess: invalidateAll,
    }),
    importWorkspace: useMutation({
      mutationFn: (data: WorkspaceExport) => invoke('workspace.import', { data }),
      onSuccess: invalidateAll,
    }),
    exportWorkspace: useMutation({
      mutationFn: (id: string) => invoke('workspace.export', { id }),
    }),
  };
}
