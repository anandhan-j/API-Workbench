// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionResponse } from '@shared/execution';
import type { WorkflowGraph, WorkflowNode } from '@shared/workflow';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { WorkflowService, type WorkflowServiceDeps } from '../workflow-service';

const pos = { x: 0, y: 0 };

function okResponse(): ExecutionResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    body: '',
    bodyKind: 'empty',
    contentType: '',
    sizeBytes: 0,
    timings: { startedAt: 0, totalMs: 1 },
    redirects: [],
    retries: 0,
  };
}

describe('WorkflowService', () => {
  let dir: string;
  let persistence: PersistenceService;
  let service: WorkflowService;
  let projectId: string;
  let executeRequest: ReturnType<typeof vi.fn>;

  const deps = (): WorkflowServiceDeps => ({
    executeRequest,
    evaluate: (template, ctx) =>
      template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => ctx.runtime[k] ?? ''),
  });

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-wf-'));
    persistence = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    executeRequest = vi.fn(async () => okResponse());
    service = new WorkflowService(persistence, deps());
    const ws = persistence.workspaces.create({ name: 'WS' });
    projectId = persistence.projects.create({ workspaceId: ws.id, name: 'P' }).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a workflow seeded with a single start node', () => {
    const wf = service.create({ projectId, name: 'Onboarding' });
    expect(wf.name).toBe('Onboarding');
    expect(wf.graph.nodes).toHaveLength(1);
    expect(wf.graph.nodes[0].kind).toBe('start');
    expect(wf.graph.edges).toHaveLength(0);
  });

  it('lists workflows as summaries with a node count', () => {
    service.create({ projectId, name: 'B' });
    service.create({ projectId, name: 'A' });
    const list = service.list(projectId);
    expect(list.map((w) => w.name)).toEqual(['A', 'B']); // ordered by name
    expect(list[0].nodeCount).toBe(1);
  });

  it('saves and reloads the full graph', () => {
    const created = service.create({ projectId, name: 'WF' });
    const nodes: WorkflowNode[] = [
      ...created.graph.nodes,
      { id: 'end', kind: 'end', name: 'End', position: pos, config: {} },
    ];
    const graph: WorkflowGraph = {
      nodes,
      edges: [{ id: 'e1', source: created.graph.nodes[0].id, target: 'end' }],
      groups: [],
    };
    const saved = service.save({ id: created.id, name: 'Renamed', description: 'desc', graph });
    expect(saved.name).toBe('Renamed');
    expect(saved.description).toBe('desc');

    const reloaded = service.get(created.id);
    expect(reloaded.graph.nodes).toHaveLength(2);
    expect(reloaded.graph.edges).toHaveLength(1);
  });

  it('deletes a workflow', () => {
    const wf = service.create({ projectId, name: 'Temp' });
    service.delete(wf.id);
    expect(service.list(projectId)).toHaveLength(0);
  });

  it('runs a persisted workflow end-to-end through the engine', async () => {
    const created = service.create({ projectId, name: 'Run me' });
    const startId = created.graph.nodes[0].id;
    const nodes: WorkflowNode[] = [
      created.graph.nodes[0],
      { id: 'v', kind: 'set-variable', name: 'set base', position: pos, config: { key: 'base', value: '7' } },
      {
        id: 'r',
        kind: 'request',
        name: 'call',
        position: pos,
        config: { method: 'GET', url: 'https://x/{{base}}', headers: {}, query: {}, body: { type: 'none' }, extract: [] },
      },
      { id: 'end', kind: 'end', name: 'End', position: pos, config: {} },
    ];
    service.save({
      id: created.id,
      graph: {
        nodes,
        edges: [
          { id: 'e1', source: startId, target: 'v' },
          { id: 'e2', source: 'v', target: 'r' },
          { id: 'e3', source: 'r', target: 'end' },
        ],
        groups: [],
      },
    });

    const result = await service.run({ workflowId: created.id });
    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ base: '7' });
    expect(executeRequest).toHaveBeenCalledTimes(1);
    // The request node received the propagated runtime context.
    const ctx = executeRequest.mock.calls[0][1] as { workflowId: string; runtime: Record<string, string> };
    expect(ctx.workflowId).toBe(created.id);
    expect(ctx.runtime.base).toBe('7');
  });

  it('throws when running an unknown workflow', async () => {
    await expect(service.run({ workflowId: 'nope' })).rejects.toThrow();
  });
});
