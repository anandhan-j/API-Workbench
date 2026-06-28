// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionResponse } from '@shared/execution';
import type { RequestNodeConfig, WorkflowDetail, WorkflowGraph, WorkflowNode } from '@shared/workflow';
import { WorkflowEngine, type WorkflowEnginePorts, type RunContext } from '../workflow-engine';

const pos = { x: 0, y: 0 };

function okResponse(status = 200): ExecutionResponse {
  return {
    ok: status < 400,
    status,
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

/** A deterministic clock that advances by one tick per read. */
function tickClock(): () => number {
  let t = 0;
  return () => t++;
}

/** Substitutes `{{ key }}` from the run context's runtime map. */
function fakeEvaluate(template: string, ctx: RunContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => ctx.runtime[k] ?? '');
}

function makePorts(overrides: Partial<WorkflowEnginePorts> = {}): WorkflowEnginePorts {
  return {
    executeRequest: vi.fn(async () => okResponse()),
    evaluate: fakeEvaluate,
    loadWorkflow: () => {
      throw new Error('no sub-workflow registered');
    },
    now: tickClock(),
    sleep: vi.fn(async () => undefined),
    ...overrides,
  };
}

/** Builds a workflow whose nodes are wired head-to-tail into a linear chain. */
function linearWorkflow(id: string, nodes: WorkflowNode[]): WorkflowDetail {
  const edges: WorkflowGraph['edges'] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({ id: `e${i}`, source: nodes[i].id, target: nodes[i + 1].id });
  }
  return {
    id,
    projectId: 'p',
    name: id,
    description: null,
    createdAt: 0,
    updatedAt: 0,
    graph: { nodes, edges, groups: [] },
  };
}

const start = (): WorkflowNode => ({ id: 'start', kind: 'start', name: 'Start', position: pos, config: {} });
const end = (): WorkflowNode => ({ id: 'end', kind: 'end', name: 'End', position: pos, config: {} });
const setVar = (id: string, key: string, value: string): WorkflowNode => ({
  id,
  kind: 'set-variable',
  name: `set ${key}`,
  position: pos,
  config: { key, value },
});
const request = (id: string, config?: Partial<RequestNodeConfig>): WorkflowNode => ({
  id,
  kind: 'request',
  name: `req ${id}`,
  position: pos,
  config: { method: 'GET', url: 'https://x', headers: {}, query: {}, body: { type: 'none' }, extract: [], ...config },
});

describe('WorkflowEngine', () => {
  it('executes nodes in order and reports each result', async () => {
    const wf = linearWorkflow('w', [start(), setVar('v', 'a', '1'), request('r'), end()]);
    const result = await new WorkflowEngine(makePorts()).run(wf);

    expect(result.status).toBe('success');
    expect(result.nodeResults.map((n) => n.nodeId)).toEqual(['start', 'v', 'r', 'end']);
    expect(result.nodeResults.every((n) => n.status === 'success')).toBe(true);
  });

  it('propagates set-variable values into later nodes', async () => {
    const executeRequest = vi.fn(async () => okResponse());
    const wf = linearWorkflow('w', [
      start(),
      setVar('v1', 'base', '10'),
      setVar('v2', 'derived', '{{base}}0'),
      request('r'),
      end(),
    ]);
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(wf);

    // The second set-variable composed the first via the runtime context.
    expect(result.finalVariables).toMatchObject({ base: '10', derived: '100' });
    // The request node saw the accumulated runtime context.
    const ctx = (executeRequest.mock.calls[0] as unknown[])[1] as RunContext;
    expect(ctx.runtime).toMatchObject({ base: '10', derived: '100' });
  });

  it('is deterministic: identical inputs yield identical results', async () => {
    const build = (): WorkflowDetail =>
      linearWorkflow('w', [start(), setVar('v', 'a', '{{seed}}!'), request('r'), end()]);
    const run = () =>
      new WorkflowEngine(makePorts()).run(build(), { runtime: { seed: 'x' } });

    const a = await run();
    const b = await run();
    expect(b).toEqual(a);
  });

  it('seeds runtime variables and returns them in finalVariables', async () => {
    const wf = linearWorkflow('w', [start(), end()]);
    const result = await new WorkflowEngine(makePorts()).run(wf, { runtime: { token: 'abc' } });
    expect(result.finalVariables).toEqual({ token: 'abc' });
  });

  it('stops the run when a request node fails', async () => {
    const executeRequest = vi.fn(async () => ({ ...okResponse(0), error: 'ECONNREFUSED' }));
    const wf = linearWorkflow('w', [start(), request('r'), setVar('after', 'x', '1'), end()]);
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(wf);

    expect(result.status).toBe('failed');
    expect(result.nodeResults.map((n) => n.nodeId)).toEqual(['start', 'r']);
    expect(result.nodeResults[1].status).toBe('failed');
    expect(result.nodeResults[1].message).toBe('ECONNREFUSED');
    // The node after the failure never ran.
    expect(result.finalVariables).not.toHaveProperty('x');
  });

  it('treats a non-2xx HTTP status as a completed (not failed) node', async () => {
    const executeRequest = vi.fn(async () => okResponse(404));
    const wf = linearWorkflow('w', [start(), request('r'), end()]);
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(wf);
    expect(result.status).toBe('success');
    expect(result.nodeResults[1].status).toBe('success');
    expect(result.nodeResults[1].response?.status).toBe(404);
  });

  it('invokes the injected sleep for delay nodes', async () => {
    const sleep = vi.fn(async () => undefined);
    const wf = linearWorkflow('w', [
      start(),
      { id: 'd', kind: 'delay', name: 'wait', position: pos, config: { ms: 250 } },
      end(),
    ]);
    const result = await new WorkflowEngine(makePorts({ sleep })).run(wf);
    expect(sleep).toHaveBeenCalledWith(250, expect.any(AbortSignal));
    expect(result.status).toBe('success');
  });

  it('runs a sub-workflow and merges its variables back', async () => {
    const child = linearWorkflow('child', [
      { id: 'cs', kind: 'start', name: 'Start', position: pos, config: {} },
      setVar('cv', 'fromChild', 'yes'),
      { id: 'ce', kind: 'end', name: 'End', position: pos, config: {} },
    ]);
    const parent = linearWorkflow('parent', [
      start(),
      { id: 'sub', kind: 'sub-workflow', name: 'call child', position: pos, config: { workflowId: 'child' } },
      end(),
    ]);
    const ports = makePorts({ loadWorkflow: (id) => (id === 'child' ? child : (() => { throw new Error('?'); })()) });
    const result = await new WorkflowEngine(ports).run(parent);

    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ fromChild: 'yes' });
    // The child's nodes are recorded inline in the run.
    expect(result.nodeResults.some((n) => n.nodeId === 'cv')).toBe(true);
  });

  it('detects sub-workflow recursion and fails the node', async () => {
    const selfRef = linearWorkflow('loop', [
      start(),
      { id: 'sub', kind: 'sub-workflow', name: 'self', position: pos, config: { workflowId: 'loop' } },
      end(),
    ]);
    const ports = makePorts({ loadWorkflow: () => selfRef });
    const result = await new WorkflowEngine(ports).run(selfRef);

    expect(result.status).toBe('failed');
    const sub = result.nodeResults.find((n) => n.nodeId === 'sub');
    expect(sub?.status).toBe('failed');
    expect(sub?.message).toMatch(/cycle/i);
  });

  it('returns cancelled when the signal is already aborted', async () => {
    const wf = linearWorkflow('w', [start(), request('r'), end()]);
    const controller = new AbortController();
    controller.abort();
    const result = await new WorkflowEngine(makePorts()).run(wf, { signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect(result.nodeResults).toHaveLength(0);
  });
});
