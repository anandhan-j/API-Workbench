// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toProtocolResponse, type ProtocolResponse } from '@shared/protocol';
import type { WorkflowGraph, WorkflowNode } from '@shared/workflow';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { WorkflowService, type WorkflowServiceDeps } from '../workflow-service';

const pos = { x: 0, y: 0 };

function okResponse(): ProtocolResponse {
  return toProtocolResponse({
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
  });
}

describe('WorkflowService', () => {
  let dir: string;
  let persistence: PersistenceService;
  let service: WorkflowService;
  let projectId: string;
  let executeRequest: Mock<WorkflowServiceDeps['executeRequest']>;

  const deps = (): WorkflowServiceDeps => ({
    executeRequest,
    evaluate: (template, ctx) =>
      template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => ctx.runtime[k] ?? ''),
  });

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-wf-'));
    persistence = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    executeRequest = vi.fn<WorkflowServiceDeps['executeRequest']>(async () => okResponse());
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

  it('renames a workflow without touching its graph', () => {
    const created = service.create({ projectId, name: 'Old name' });
    const renamed = service.rename(created.id, '  New name  ');
    expect(renamed.name).toBe('New name'); // trimmed
    expect(renamed.nodeCount).toBe(created.graph.nodes.length);

    const reloaded = service.get(created.id);
    expect(reloaded.name).toBe('New name');
    expect(reloaded.graph.nodes).toHaveLength(created.graph.nodes.length);
  });

  it('throws when renaming an unknown workflow', () => {
    expect(() => service.rename('nope', 'X')).toThrow();
  });

  it('deletes a workflow', () => {
    const wf = service.create({ projectId, name: 'Temp' });
    service.delete(wf.id);
    expect(service.list(projectId)).toHaveLength(0);
  });

  it('duplicates a workflow, appending "(duplicate)" and deep-copying the graph', () => {
    const original = service.create({ projectId, name: 'Signup', description: 'desc' });
    const startId = original.graph.nodes[0].id;
    service.save({
      id: original.id,
      graph: {
        nodes: [
          original.graph.nodes[0],
          { id: 'end', kind: 'end', name: 'End', position: pos, config: {} },
        ],
        edges: [{ id: 'e1', source: startId, target: 'end' }],
        groups: [],
      },
    });

    const copy = service.duplicate(original.id);
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Signup (duplicate)');
    expect(copy.description).toBe('desc');
    expect(copy.projectId).toBe(projectId);
    // Graph is copied verbatim, not shared.
    expect(copy.graph.nodes).toHaveLength(2);
    expect(copy.graph.edges).toHaveLength(1);
    expect(copy.graph).not.toBe(original.graph);

    // Editing the copy does not affect the original.
    service.rename(copy.id, 'Changed');
    expect(service.get(original.id).name).toBe('Signup');
  });

  it('numbers repeated duplicates so names stay distinct', () => {
    const original = service.create({ projectId, name: 'Flow' });
    const first = service.duplicate(original.id);
    const second = service.duplicate(original.id);
    const third = service.duplicate(original.id);
    expect(first.name).toBe('Flow (duplicate)');
    expect(second.name).toBe('Flow (duplicate 2)');
    expect(third.name).toBe('Flow (duplicate 3)');
  });

  it('keeps sub-workflow references pointing at the existing sub-workflow (not a clone)', () => {
    const child = service.create({ projectId, name: 'Child' });
    const parent = service.create({ projectId, name: 'Parent' });
    service.save({
      id: parent.id,
      graph: {
        nodes: [
          parent.graph.nodes[0],
          { id: 'sub', kind: 'sub-workflow', name: 'child', position: pos, config: { workflowId: child.id } },
        ],
        edges: [{ id: 'e1', source: parent.graph.nodes[0].id, target: 'sub' }],
        groups: [],
      },
    });

    const before = service.list(projectId).length;
    const copy = service.duplicate(parent.id);
    // Only one new workflow — the sub-workflow is referenced, not duplicated.
    expect(service.list(projectId).length).toBe(before + 1);
    const subNode = copy.graph.nodes.find((n) => n.kind === 'sub-workflow');
    expect((subNode?.config as { workflowId: string }).workflowId).toBe(child.id);
  });

  it('throws when duplicating an unknown workflow', () => {
    expect(() => service.duplicate('nope')).toThrow();
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
        config: { type: 'http', payload: { method: 'GET', url: 'https://x/{{base}}', headers: {}, query: {}, body: { type: 'none' } }, extract: [] },
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

  it('exports a workflow with its full graph, bundling referenced sub-workflows', () => {
    const child = service.create({ projectId, name: 'Child' });
    const parent = service.create({ projectId, name: 'Parent' });
    const startId = parent.graph.nodes[0].id;
    service.save({
      id: parent.id,
      graph: {
        nodes: [
          parent.graph.nodes[0],
          {
            id: 'req',
            kind: 'request',
            name: 'call',
            position: pos,
            config: { type: 'http', payload: { method: 'POST', url: 'https://x', headers: { 'X-A': '1' }, query: {}, body: { type: 'none' } }, extract: [] },
          },
          { id: 'sub', kind: 'sub-workflow', name: 'child', position: pos, config: { workflowId: child.id } },
          { id: 'end', kind: 'end', name: 'End', position: pos, config: {} },
        ],
        edges: [
          { id: 'e1', source: startId, target: 'req' },
          { id: 'e2', source: 'req', target: 'sub' },
          { id: 'e3', source: 'sub', target: 'end' },
        ],
        groups: [],
      },
    });

    const bundle = service.exportWorkflow(parent.id, 1234);
    expect(bundle.formatVersion).toBe(1);
    expect(bundle.exportedAt).toBe(1234);
    expect(bundle.rootId).toBe(parent.id);
    expect(bundle.workflows.map((w) => w.id).sort()).toEqual([child.id, parent.id].sort());
    // The full request config travels with the bundle, not a reference.
    const root = bundle.workflows.find((w) => w.id === parent.id);
    const reqNode = root?.graph.nodes.find((n) => n.id === 'req');
    expect(reqNode?.config).toMatchObject({
      type: 'http',
      payload: { method: 'POST', url: 'https://x', headers: { 'X-A': '1' } },
    });
  });

  it('imports a bundle with fresh ids, remapping sub-workflow references', () => {
    const child = service.create({ projectId, name: 'Child' });
    const parent = service.create({ projectId, name: 'Parent' });
    service.save({
      id: parent.id,
      graph: {
        nodes: [
          parent.graph.nodes[0],
          { id: 'sub', kind: 'sub-workflow', name: 'child', position: pos, config: { workflowId: child.id } },
        ],
        edges: [{ id: 'e1', source: parent.graph.nodes[0].id, target: 'sub' }],
        groups: [],
      },
    });

    const bundle = service.exportWorkflow(parent.id);
    const before = service.list(projectId).length;
    const imported = service.importWorkflow({ projectId, data: bundle });

    // Two fresh workflows created (parent + child), with new ids.
    expect(service.list(projectId).length).toBe(before + 2);
    expect(imported.id).not.toBe(parent.id);

    // The imported parent's sub-workflow points at the imported child, not the original.
    const subNode = imported.graph.nodes.find((n) => n.kind === 'sub-workflow');
    const newWorkflowId = (subNode?.config as { workflowId: string }).workflowId;
    expect(newWorkflowId).not.toBe(child.id);
    expect(service.get(newWorkflowId).name).toBe('Child');
  });

  it('round-trips a workflow through export and import', () => {
    const created = service.create({ projectId, name: 'RoundTrip', description: 'desc' });
    const bundle = service.exportWorkflow(created.id);
    const imported = service.importWorkflow({ projectId, data: bundle });
    expect(imported.name).toBe('RoundTrip');
    expect(imported.description).toBe('desc');
    expect(imported.graph.nodes).toHaveLength(created.graph.nodes.length);
  });
});
