import { describe, expect, it, vi } from 'vitest';

import type { WorkflowExport } from '@shared/workflow';

import { createAppRpcHandler } from '../app-import';
import type { AppRpcRequest } from '../mcp-manager';

const VALID_EXPORT: WorkflowExport = {
  formatVersion: 1,
  exportedAt: 0,
  rootId: 'wf-x',
  workflows: [
    {
      id: 'wf-x',
      name: 'Create post',
      description: null,
      graph: {
        nodes: [
          { id: 'start', kind: 'start', name: 'Start', position: { x: 0, y: 0 }, config: {} },
          { id: 'end', kind: 'end', name: 'End', position: { x: 200, y: 0 }, config: { outcome: 'success' } },
        ],
        edges: [{ id: 'e1', source: 'start', target: 'end' }],
        groups: [],
      },
    },
  ],
};

function req(method: string, params?: unknown): AppRpcRequest {
  return { id: 1, method, params };
}

describe('createAppRpcHandler (importWorkflow)', () => {
  it('imports a valid workflow into the active project and notifies', async () => {
    const importWorkflow = vi.fn(() => ({ id: 'new-id', name: 'Create post' }));
    const onImported = vi.fn();
    const handle = createAppRpcHandler({
      importWorkflow,
      getActiveProjectId: () => 'proj-1',
      onImported,
    });

    const res = await handle(req('importWorkflow', { workflow: VALID_EXPORT }));

    expect(res).toEqual({ ok: true, result: { id: 'new-id', name: 'Create post' } });
    expect(importWorkflow).toHaveBeenCalledWith(VALID_EXPORT, 'proj-1');
    expect(onImported).toHaveBeenCalledWith('proj-1');
  });

  it('rejects an unknown method without importing', async () => {
    const importWorkflow = vi.fn();
    const handle = createAppRpcHandler({ importWorkflow, getActiveProjectId: () => 'proj-1' });

    const res = await handle(req('deleteEverything', {}));

    expect(res).toEqual({ ok: false, error: expect.stringContaining('Unknown app request') });
    expect(importWorkflow).not.toHaveBeenCalled();
  });

  it('rejects a malformed workflow bundle without importing', async () => {
    const importWorkflow = vi.fn();
    const handle = createAppRpcHandler({ importWorkflow, getActiveProjectId: () => 'proj-1' });

    const res = await handle(req('importWorkflow', { workflow: { nope: true } }));

    expect(res).toEqual({ ok: false, error: expect.stringContaining('not a valid API Workbench export') });
    expect(importWorkflow).not.toHaveBeenCalled();
  });

  it('reports when no project is open (and does not import)', async () => {
    const importWorkflow = vi.fn();
    const onImported = vi.fn();
    const handle = createAppRpcHandler({ importWorkflow, getActiveProjectId: () => null, onImported });

    const res = await handle(req('importWorkflow', { workflow: VALID_EXPORT }));

    expect(res).toEqual({ ok: false, error: expect.stringContaining('No project is open') });
    expect(importWorkflow).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('surfaces an import failure as an error result (and does not notify)', async () => {
    const importWorkflow = vi.fn(() => {
      throw new Error('disk full');
    });
    const onImported = vi.fn();
    const handle = createAppRpcHandler({ importWorkflow, getActiveProjectId: () => 'proj-1', onImported });

    const res = await handle(req('importWorkflow', { workflow: VALID_EXPORT }));

    expect(res).toEqual({ ok: false, error: 'disk full' });
    expect(onImported).not.toHaveBeenCalled();
  });
});
