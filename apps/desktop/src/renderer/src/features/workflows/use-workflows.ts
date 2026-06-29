import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImportWorkflowInput, SaveWorkflowInput, WorkflowRunRequest } from '@shared/workflow';
import { invoke, isBridgeAvailable } from '../../lib/ipc';

/** React Query hooks over the workflow IPC channels (Phase 12). */

export function useWorkflows(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['workflows', projectId ?? ''],
    queryFn: () => invoke('workflow.list', { projectId: projectId as string }),
    enabled: Boolean(projectId) && isBridgeAvailable(),
  });
}

export function useWorkflow(id: string | null | undefined) {
  return useQuery({
    queryKey: ['workflow', id ?? ''],
    queryFn: () => invoke('workflow.get', { id: id as string }),
    enabled: Boolean(id) && isBridgeAvailable(),
  });
}

export function useWorkflowMutations(projectId: string | null | undefined) {
  const qc = useQueryClient();
  const invalidateList = () =>
    void qc.invalidateQueries({ queryKey: ['workflows', projectId ?? ''] });

  return {
    create: useMutation({
      mutationFn: (input: { projectId: string; name: string; description?: string }) =>
        invoke('workflow.create', input),
      onSuccess: invalidateList,
    }),
    save: useMutation({
      mutationFn: (input: SaveWorkflowInput) => invoke('workflow.save', input),
      onSuccess: (wf) => {
        invalidateList();
        void qc.invalidateQueries({ queryKey: ['workflow', wf.id] });
      },
    }),
    remove: useMutation({
      mutationFn: (id: string) => invoke('workflow.delete', { id }),
      onSuccess: invalidateList,
    }),
    exportWorkflow: useMutation({
      mutationFn: (id: string) => invoke('workflow.export', { id }),
    }),
    importWorkflow: useMutation({
      mutationFn: (input: ImportWorkflowInput) => invoke('workflow.import', input),
      onSuccess: invalidateList,
    }),
  };
}

export function useRunWorkflow() {
  return useMutation({
    mutationFn: (request: WorkflowRunRequest) => invoke('workflow.run', request),
  });
}

/** Pause / resume / cancel controls for an in-flight run, addressed by workflow id. */
export function useRunControls() {
  return {
    pause: useMutation({ mutationFn: (id: string) => invoke('workflow.pause', { id }) }),
    resume: useMutation({ mutationFn: (id: string) => invoke('workflow.resume', { id }) }),
    cancel: useMutation({ mutationFn: (id: string) => invoke('workflow.cancel', { id }) }),
  };
}
