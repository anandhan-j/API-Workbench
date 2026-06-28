// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionResponse } from '@shared/execution';
import type { WorkflowDetail, WorkflowEdge, WorkflowNode } from '@shared/workflow';
import { WorkflowEngine, type WorkflowEnginePorts, type RunContext } from '../workflow-engine';

const pos = { x: 0, y: 0 };

function jsonResponse(body: string): ExecutionResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { 'x-token': 'hdr-tok' },
    body,
    bodyKind: 'json',
    contentType: 'application/json',
    sizeBytes: body.length,
    timings: { startedAt: 0, totalMs: 1 },
    redirects: [],
    retries: 0,
  };
}

function evaluate(template: string, ctx: RunContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => ctx.runtime[k] ?? '');
}

function makePorts(o: Partial<WorkflowEnginePorts> = {}): WorkflowEnginePorts {
  let t = 0;
  return {
    executeRequest: vi.fn(async () => jsonResponse('{}')),
    evaluate,
    loadWorkflow: () => {
      throw new Error('no sub-workflow');
    },
    now: () => t++,
    sleep: vi.fn(async () => undefined),
    ...o,
  };
}

function wf(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowDetail {
  return { id: 'w', projectId: 'p', name: 'w', description: null, createdAt: 0, updatedAt: 0, graph: { nodes, edges, groups: [] } };
}

const start = (): WorkflowNode => ({ id: 'start', kind: 'start', name: 'Start', position: pos, config: {} });
const end = (): WorkflowNode => ({ id: 'end', kind: 'end', name: 'End', position: pos, config: {} });
const edge = (id: string, source: string, target: string): WorkflowEdge => ({ id, source, target });

describe('WorkflowEngine — mapping', () => {
  it('extracts response values into runtime variables on a request node', async () => {
    const body = '{"token":"abc","items":[{"id":7}]}';
    const executeRequest = vi.fn(async () => jsonResponse(body));
    const reqNode: WorkflowNode = {
      id: 'r',
      kind: 'request',
      name: 'login',
      position: pos,
      config: {
        method: 'POST',
        url: '/login',
        headers: {},
        query: {},
        body: { type: 'none' },
        extract: [
          { variable: 'tok', source: 'body', engine: 'jsonpath', expression: '$.token' },
          { variable: 'firstId', source: 'body', engine: 'jmespath', expression: 'items[0].id' },
          { variable: 'hdr', source: 'header', engine: 'jsonpath', expression: 'X-Token' },
        ],
      },
    };
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(
      wf([start(), reqNode, end()], [edge('e0', 'start', 'r'), edge('e1', 'r', 'end')]),
    );
    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ tok: 'abc', firstId: '7', hdr: 'hdr-tok' });
  });

  it('transform node (template) composes a new variable from context', async () => {
    const t: WorkflowNode = { id: 't', kind: 'transform', name: 'combo', position: pos, config: { variable: 'combo', engine: 'template', input: '', expression: '{{a}}-{{b}}' } };
    const result = await new WorkflowEngine(makePorts()).run(
      wf([start(), t, end()], [edge('e0', 'start', 't'), edge('e1', 't', 'end')]),
      { runtime: { a: '1', b: '2' } },
    );
    expect(result.finalVariables).toMatchObject({ combo: '1-2' });
  });

  it('transform node (jsonpath) extracts from a variable holding JSON', async () => {
    const setPayload: WorkflowNode = { id: 'p', kind: 'set-variable', name: 'p', position: pos, config: { key: 'payload', value: '{"n":9}' } };
    const t: WorkflowNode = { id: 't', kind: 'transform', name: 'n', position: pos, config: { variable: 'n', engine: 'jsonpath', input: '{{payload}}', expression: '$.n' } };
    const result = await new WorkflowEngine(makePorts()).run(
      wf([start(), setPayload, t, end()], [edge('e0', 'start', 'p'), edge('e1', 'p', 't'), edge('e2', 't', 'end')]),
    );
    expect(result.finalVariables).toMatchObject({ n: '9' });
  });
});
