import { WorkflowExport } from '@shared/workflow';

import type { AppRpcRequest, AppRpcResult } from './mcp-manager';

/**
 * The app side of the MCP back-channel: services requests the workflow-mcp child
 * sends back to the app (see {@link McpManagerDeps.handleAppRpc}). Currently the
 * one method is `importWorkflow` — importing a workflow authored in an AI client
 * straight into the running app.
 *
 * Extracted from the composition root as an injectable factory so its branches
 * (unknown method, malformed bundle, no open project, success, failure) are
 * unit-testable without Electron or a real child process.
 */
export interface AppImportDeps {
  /** Imports a validated bundle into the given project, returning the new workflow. */
  importWorkflow: (data: WorkflowExport, projectId: string) => { id: string; name: string };
  /** The project to import into, or null when no project is open. */
  getActiveProjectId: () => string | null;
  /** Notified after a successful import (e.g. to refresh the renderer's list). */
  onImported?: (projectId: string) => void;
}

export function createAppRpcHandler(
  deps: AppImportDeps,
): (request: AppRpcRequest) => Promise<AppRpcResult> {
  return (request) => Promise.resolve(handle(deps, request));
}

function handle(deps: AppImportDeps, request: AppRpcRequest): AppRpcResult {
  if (request.method !== 'importWorkflow') {
    return { ok: false, error: `Unknown app request "${request.method}".` };
  }

  const parsed = WorkflowExport.safeParse((request.params as { workflow?: unknown })?.workflow);
  if (!parsed.success) {
    return { ok: false, error: 'The workflow bundle is not a valid API Workbench export.' };
  }

  const projectId = deps.getActiveProjectId();
  if (!projectId) {
    return { ok: false, error: 'No project is open in API Workbench. Open a project, then try again.' };
  }

  try {
    const created = deps.importWorkflow(parsed.data, projectId);
    deps.onImported?.(projectId);
    return { ok: true, result: { id: created.id, name: created.name } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
