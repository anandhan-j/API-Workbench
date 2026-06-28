// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionResponse } from '@shared/execution';
import type { WorkflowDetail, WorkflowEdge, WorkflowNode } from '@shared/workflow';
import { WorkflowEngine, type WorkflowEnginePorts, type RunContext } from '../workflow-engine';
import { RunController } from '../run-controller';

const pos = { x: 0, y: 0 };

function okResponse(error?: string): ExecutionResponse {
  return {
    ok: !error,
    status: error ? 0 : 200,
    statusText: error ? '' : 'OK',
    headers: {},
    body: '',
    bodyKind: 'empty',
    contentType: '',
    sizeBytes: 0,
    timings: { startedAt: 0, totalMs: 1 },
    redirects: [],
    retries: 0,
    ...(error ? { error } : {}),
  };
}

function tickClock(): () => number {
  let t = 0;
  return () => t++;
}

function evaluate(template: string, ctx: RunContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => ctx.runtime[k] ?? '');
}

function makePorts(o: Partial<WorkflowEnginePorts> = {}): WorkflowEnginePorts {
  return {
    executeRequest: vi.fn(async () => okResponse()),
    evaluate,
    loadWorkflow: () => {
      throw new Error('no sub-workflow');
    },
    now: tickClock(),
    sleep: vi.fn(async () => undefined),
    ...o,
  };
}

function wf(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowDetail {
  return { id: 'w', projectId: 'p', name: 'w', description: null, createdAt: 0, updatedAt: 0, graph: { nodes, edges, groups: [] } };
}

const start = (): WorkflowNode => ({ id: 'start', kind: 'start', name: 'Start', position: pos, config: {} });
const end = (id = 'end'): WorkflowNode => ({ id, kind: 'end', name: 'End', position: pos, config: {} });
const setVar = (id: string, key: string, value: string, policy?: WorkflowNode['policy']): WorkflowNode => ({ id, kind: 'set-variable', name: id, position: pos, config: { key, value }, ...(policy ? { policy } : {}) });
const req = (id: string, policy?: WorkflowNode['policy']): WorkflowNode => ({ id, kind: 'request', name: id, position: pos, config: { method: 'GET', url: '/x', headers: {}, query: {}, body: { type: 'none' }, extract: [] }, ...(policy ? { policy } : {}) });
const edge = (id: string, source: string, target: string, handle?: string): WorkflowEdge => ({ id, source, target, ...(handle ? { sourceHandle: handle } : {}) });

describe('WorkflowEngine — control flow', () => {
  it('routes a condition node down the true/false branch', async () => {
    const build = (): WorkflowDetail =>
      wf(
        [start(), { id: 'c', kind: 'condition', name: 'C', position: pos, config: { expression: '{{go}}' } }, setVar('a', 'hitA', '1'), setVar('b', 'hitB', '1'), end()],
        [edge('e0', 'start', 'c'), edge('t', 'c', 'a', 'true'), edge('f', 'c', 'b', 'false'), edge('ea', 'a', 'end'), edge('eb', 'b', 'end')],
      );
    const whenTrue = await new WorkflowEngine(makePorts()).run(build(), { runtime: { go: 'true' } });
    expect(whenTrue.finalVariables).toMatchObject({ go: 'true', hitA: '1' });
    expect(whenTrue.finalVariables).not.toHaveProperty('hitB');

    const whenFalse = await new WorkflowEngine(makePorts()).run(build(), { runtime: { go: '' } });
    expect(whenFalse.finalVariables).toMatchObject({ hitB: '1' });
    expect(whenFalse.finalVariables).not.toHaveProperty('hitA');
  });

  it('routes a switch node by case, falling back to default', async () => {
    const build = (): WorkflowDetail =>
      wf(
        [start(), { id: 'sw', kind: 'switch', name: 'SW', position: pos, config: { value: '{{x}}', cases: ['a', 'b'] } }, setVar('na', 'na', '1'), setVar('nb', 'nb', '1'), setVar('nd', 'nd', '1'), end()],
        [edge('e0', 'start', 'sw'), edge('ca', 'sw', 'na', 'a'), edge('cb', 'sw', 'nb', 'b'), edge('cd', 'sw', 'nd', 'default'), edge('xa', 'na', 'end'), edge('xb', 'nb', 'end'), edge('xd', 'nd', 'end')],
      );
    const b = await new WorkflowEngine(makePorts()).run(build(), { runtime: { x: 'b' } });
    expect(b.finalVariables).toMatchObject({ nb: '1' });
    const d = await new WorkflowEngine(makePorts()).run(build(), { runtime: { x: 'zzz' } });
    expect(d.finalVariables).toMatchObject({ nd: '1' });
  });

  it('runs a loop body a fixed number of times', async () => {
    const executeRequest = vi.fn(async () => okResponse());
    const workflow = wf(
      [start(), { id: 'l', kind: 'loop', name: 'L', position: pos, config: { mode: 'times', times: 3 } }, req('r'), end()],
      [edge('e0', 'start', 'l'), edge('body', 'l', 'r', 'body'), edge('back', 'r', 'l'), edge('done', 'l', 'end', 'done')],
    );
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(workflow);
    expect(result.status).toBe('success');
    expect(executeRequest).toHaveBeenCalledTimes(3);
  });

  it('bounds a while loop by maxIterations', async () => {
    const executeRequest = vi.fn(async () => okResponse());
    const workflow = wf(
      [start(), { id: 'l', kind: 'loop', name: 'L', position: pos, config: { mode: 'while', condition: '{{keep}}', maxIterations: 4 } }, req('r'), end()],
      [edge('e0', 'start', 'l'), edge('body', 'l', 'r', 'body'), edge('back', 'r', 'l'), edge('done', 'l', 'end', 'done')],
    );
    const looped = await new WorkflowEngine(makePorts({ executeRequest })).run(workflow, { runtime: { keep: 'yes' } });
    expect(looped.status).toBe('success');
    expect(executeRequest).toHaveBeenCalledTimes(4);

    const executeRequest2 = vi.fn(async () => okResponse());
    const none = await new WorkflowEngine(makePorts({ executeRequest: executeRequest2 })).run(workflow, { runtime: { keep: '' } });
    expect(none.status).toBe('success');
    expect(executeRequest2).not.toHaveBeenCalled();
  });

  it('retries a failing node and succeeds within the retry budget', async () => {
    let calls = 0;
    const executeRequest = vi.fn(async () => {
      calls++;
      return calls < 3 ? okResponse('ECONNRESET') : okResponse();
    });
    const workflow = wf([start(), req('r', { retries: 2 }), end()], [edge('e0', 'start', 'r'), edge('e1', 'r', 'end')]);
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(workflow);
    expect(result.status).toBe('success');
    expect(executeRequest).toHaveBeenCalledTimes(3);
    expect(result.nodeResults.find((n) => n.nodeId === 'r')?.attempts).toBe(3);
  });

  it('times out a node that never settles', async () => {
    const executeRequest = vi.fn(() => new Promise<ExecutionResponse>(() => undefined));
    const workflow = wf([start(), req('r', { timeoutMs: 50 }), end()], [edge('e0', 'start', 'r'), edge('e1', 'r', 'end')]);
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(workflow);
    expect(result.status).toBe('failed');
    expect(result.nodeResults.find((n) => n.nodeId === 'r')?.message).toMatch(/timed out/i);
  });

  it('continues past a failed node when onError is continue', async () => {
    const executeRequest = vi.fn(async () => okResponse('boom'));
    const workflow = wf(
      [start(), req('r', { onError: 'continue' }), setVar('after', 'after', '1'), end()],
      [edge('e0', 'start', 'r'), edge('e1', 'r', 'after'), edge('e2', 'after', 'end')],
    );
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(workflow);
    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ after: '1' });
    expect(result.nodeResults.find((n) => n.nodeId === 'r')?.status).toBe('failed');
  });

  it('routes a failed node down the error edge when onError is route', async () => {
    const executeRequest = vi.fn(async () => okResponse('boom'));
    const workflow = wf(
      [start(), req('r', { onError: 'route' }), setVar('normal', 'normal', '1'), setVar('handler', 'handled', '1'), end()],
      [edge('e0', 'start', 'r'), edge('e1', 'r', 'normal'), edge('err', 'r', 'handler', 'error'), edge('e2', 'normal', 'end'), edge('e3', 'handler', 'end')],
    );
    const result = await new WorkflowEngine(makePorts({ executeRequest })).run(workflow);
    expect(result.finalVariables).toMatchObject({ handled: '1' });
    expect(result.finalVariables).not.toHaveProperty('normal');
  });

  it('cancels before running any node when the controller is cancelled', async () => {
    const workflow = wf([start(), req('r'), end()], [edge('e0', 'start', 'r'), edge('e1', 'r', 'end')]);
    const controller = new RunController();
    controller.cancel();
    const result = await new WorkflowEngine(makePorts()).run(workflow, { control: controller });
    expect(result.status).toBe('cancelled');
  });

  it('resumes a paused run to completion', async () => {
    const workflow = wf([start(), setVar('v', 'k', '1'), end()], [edge('e0', 'start', 'v'), edge('e1', 'v', 'end')]);
    const controller = new RunController();
    controller.pause();
    const promise = new WorkflowEngine(makePorts()).run(workflow, { control: controller });
    await Promise.resolve();
    controller.resume();
    const result = await promise;
    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ k: '1' });
  });

  it('is deterministic across branch runs', async () => {
    const build = (): WorkflowDetail =>
      wf(
        [start(), { id: 'c', kind: 'condition', name: 'C', position: pos, config: { expression: '{{go}}' } }, setVar('a', 'a', '1'), end()],
        [edge('e0', 'start', 'c'), edge('t', 'c', 'a', 'true'), edge('f', 'c', 'end', 'false'), edge('ea', 'a', 'end')],
      );
    const a = await new WorkflowEngine(makePorts()).run(build(), { runtime: { go: '1' } });
    const b = await new WorkflowEngine(makePorts()).run(build(), { runtime: { go: '1' } });
    expect(b).toEqual(a);
  });
});
