// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { toProtocolResponse, type HttpPayload, type ProtocolResponse } from '@shared/protocol';
import type { WorkflowDetail, WorkflowGraph, WorkflowNode } from '@shared/workflow';
import { WorkflowEngine, type WorkflowEnginePorts, type RunContext } from '../workflow-engine';
import { RunController } from '../run-controller';

const pos = { x: 0, y: 0 };

function okResponse(status = 200): ProtocolResponse {
  return toProtocolResponse({
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
  });
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

const start = (): WorkflowNode => ({
  id: 'start',
  kind: 'start',
  name: 'Start',
  position: pos,
  config: {},
});
const end = (): WorkflowNode => ({
  id: 'end',
  kind: 'end',
  name: 'End',
  position: pos,
  config: {},
});
const setVar = (id: string, key: string, value: string): WorkflowNode => ({
  id,
  kind: 'set-variable',
  name: `set ${key}`,
  position: pos,
  config: { key, value },
});
const request = (id: string, payload?: Partial<HttpPayload>): WorkflowNode => ({
  id,
  kind: 'request',
  name: `req ${id}`,
  position: pos,
  config: {
    type: 'http',
    payload: {
      method: 'GET',
      url: 'https://x',
      headers: {},
      query: {},
      body: { type: 'none' },
      ...payload,
    },
    extract: [],
  },
});

describe('WorkflowEngine', () => {
  it('executes nodes in order and reports each result', async () => {
    const wf = linearWorkflow('w', [start(), setVar('v', 'a', '1'), request('r'), end()]);
    const result = await new WorkflowEngine(makePorts()).run(wf);

    expect(result.status).toBe('success');
    expect(result.nodeResults.map((n) => n.nodeId)).toEqual(['start', 'v', 'r', 'end']);
    expect(result.nodeResults.every((n) => n.status === 'success')).toBe(true);
  });

  it('marks the run and the End node failed when the End outcome is "fail"', async () => {
    const failEnd: WorkflowNode = {
      id: 'end',
      kind: 'end',
      name: 'End',
      position: pos,
      config: { outcome: 'fail' },
    };
    const wf = linearWorkflow('w', [start(), failEnd]);
    const result = await new WorkflowEngine(makePorts()).run(wf);

    expect(result.status).toBe('failed');
    expect(result.nodeResults.find((n) => n.nodeId === 'end')?.status).toBe('failed');
  });

  it('a success End leaves the run successful', async () => {
    const result = await new WorkflowEngine(makePorts()).run(linearWorkflow('w', [start(), end()]));
    expect(result.status).toBe('success');
    expect(result.nodeResults.find((n) => n.nodeId === 'end')?.status).toBe('success');
  });

  it('persists a workspace-scoped set-variable via the setVariable port', async () => {
    const setVariable = vi.fn();
    const wf = linearWorkflow('w', [
      start(),
      {
        id: 'sv',
        kind: 'set-variable',
        name: 'set token',
        position: pos,
        config: { key: 'token', value: 'abc', scope: 'workspace' },
      },
      end(),
    ]);
    const result = await new WorkflowEngine(makePorts({ setVariable })).run(wf, {
      workspaceId: 'ws1',
    });

    expect(result.status).toBe('success');
    // Persisted to the durable store, with the workspace id from the run...
    expect(setVariable).toHaveBeenCalledWith(
      'workspace',
      'token',
      'abc',
      expect.objectContaining({ workspaceId: 'ws1' }),
    );
    // ...and still available in this run's runtime for later steps.
    expect(result.finalVariables).toMatchObject({ token: 'abc' });
  });

  it('a runtime-scoped set-variable does not call the persist port', async () => {
    const setVariable = vi.fn();
    const wf = linearWorkflow('w', [start(), setVar('sv', 'a', '1'), end()]);
    await new WorkflowEngine(makePorts({ setVariable })).run(wf, { workspaceId: 'ws1' });
    expect(setVariable).not.toHaveBeenCalled();
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
    const run = () => new WorkflowEngine(makePorts()).run(build(), { runtime: { seed: 'x' } });

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
    expect(result.nodeResults[1].response?.protocol).toMatchObject({ status: 404 });
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
      {
        id: 'sub',
        kind: 'sub-workflow',
        name: 'call child',
        position: pos,
        config: { workflowId: 'child' },
      },
      end(),
    ]);
    const ports = makePorts({
      loadWorkflow: (id) =>
        id === 'child'
          ? child
          : (() => {
              throw new Error('?');
            })(),
    });
    const result = await new WorkflowEngine(ports).run(parent);

    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ fromChild: 'yes' });
    // The child's nodes are recorded inline in the run.
    expect(result.nodeResults.some((n) => n.nodeId === 'cv')).toBe(true);
  });

  it('merges variables from multiple sub-workflows, each seeing the previous one', async () => {
    const childA = linearWorkflow('childA', [
      { id: 'as', kind: 'start', name: 'Start', position: pos, config: {} },
      setVar('av', 'a', '1'),
      { id: 'ae', kind: 'end', name: 'End', position: pos, config: {} },
    ]);
    const childB = linearWorkflow('childB', [
      { id: 'bs', kind: 'start', name: 'Start', position: pos, config: {} },
      setVar('bv', 'b', '{{a}}2'), // reads childA's variable from the shared runtime
      { id: 'be', kind: 'end', name: 'End', position: pos, config: {} },
    ]);
    const parent = linearWorkflow('parent', [
      start(),
      {
        id: 'subA',
        kind: 'sub-workflow',
        name: 'A',
        position: pos,
        config: { workflowId: 'childA' },
      },
      {
        id: 'subB',
        kind: 'sub-workflow',
        name: 'B',
        position: pos,
        config: { workflowId: 'childB' },
      },
      end(),
    ]);
    const ports = makePorts({
      loadWorkflow: (id) =>
        id === 'childA'
          ? childA
          : id === 'childB'
            ? childB
            : (() => {
                throw new Error('?');
              })(),
    });
    const result = await new WorkflowEngine(ports).run(parent);

    expect(result.status).toBe('success');
    // Both sub-workflows contributed; the second saw the first's variable.
    expect(result.finalVariables).toMatchObject({ a: '1', b: '12' });
  });

  it('detects sub-workflow recursion and fails the node', async () => {
    const selfRef = linearWorkflow('loop', [
      start(),
      {
        id: 'sub',
        kind: 'sub-workflow',
        name: 'self',
        position: pos,
        config: { workflowId: 'loop' },
      },
      end(),
    ]);
    const ports = makePorts({ loadWorkflow: () => selfRef });
    const result = await new WorkflowEngine(ports).run(selfRef);

    expect(result.status).toBe('failed');
    const sub = result.nodeResults.find((n) => n.nodeId === 'sub');
    expect(sub?.status).toBe('failed');
    expect(sub?.message).toMatch(/cycle/i);
  });

  it('step mode runs a sub-workflow to completion as a single step', async () => {
    const child = linearWorkflow('child', [
      { id: 'cs', kind: 'start', name: 'Start', position: pos, config: {} },
      setVar('c1', 'c1', '1'),
      setVar('c2', 'c2', '2'),
      { id: 'ce', kind: 'end', name: 'End', position: pos, config: {} },
    ]);
    const parent = linearWorkflow('parent', [
      start(),
      {
        id: 'sub',
        kind: 'sub-workflow',
        name: 'call child',
        position: pos,
        config: { workflowId: 'child' },
      },
      setVar('af', 'after', '3'),
      end(),
    ]);
    const done = new Set<string>();
    const ports = makePorts({
      loadWorkflow: (id) =>
        id === 'child'
          ? child
          : (() => {
              throw new Error('?');
            })(),
      onNodeProgress: (e) => {
        if (e.phase === 'done') done.add(e.nodeId);
      },
    });
    // Lets all pending microtasks/promise chains settle (sleep is mocked).
    const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

    const control = new RunController();
    control.startStepping();
    const p = new WorkflowEngine(ports).run(parent, { control });

    // The start node runs on the initial budget, then the run suspends before
    // the sub-workflow node.
    await flush();
    expect(done.has('start')).toBe(true);
    expect(done.has('sub')).toBe(false);

    // A single step advances past the sub-workflow node, which runs the whole
    // child (both inner set-variable nodes) to completion — the inner nodes did
    // NOT each require their own step — then suspends before the next top-level
    // node.
    control.step();
    await flush();
    expect(done.has('c1')).toBe(true);
    expect(done.has('c2')).toBe(true);
    expect(done.has('sub')).toBe(true);
    expect(done.has('af')).toBe(false);

    control.resume();
    const result = await p;
    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ c1: '1', c2: '2', after: '3' });
  });

  it('returns cancelled when the signal is already aborted', async () => {
    const wf = linearWorkflow('w', [start(), request('r'), end()]);
    const controller = new AbortController();
    controller.abort();
    const result = await new WorkflowEngine(makePorts()).run(wf, { signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect(result.nodeResults).toHaveLength(0);
  });

  const userInput = (
    id: string,
    fields: { variable: string; default?: string }[],
  ): WorkflowNode => ({
    id,
    kind: 'user-input',
    name: `ask ${id}`,
    position: pos,
    config: {
      message: 'Provide values',
      fields: fields.map((f) => ({
        label: f.variable,
        variable: f.variable,
        default: f.default ?? '',
        secret: false,
      })),
    },
  });

  it('writes user-supplied input into runtime variables for later nodes', async () => {
    const requestInput = vi.fn(async () => ({ values: { token: 'abc' }, cancelled: false }));
    const wf = linearWorkflow('w', [
      start(),
      userInput('ask', [{ variable: 'token' }]),
      request('r'),
      end(),
    ]);
    const executeRequest = vi.fn(async () => okResponse());
    const result = await new WorkflowEngine(makePorts({ requestInput, executeRequest })).run(wf);

    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ token: 'abc' });
    const ctx = (executeRequest.mock.calls[0] as unknown[])[1] as RunContext;
    expect(ctx.runtime).toMatchObject({ token: 'abc' });
  });

  it('passes evaluated field defaults to the input request', async () => {
    const requestInput = vi.fn(async () => ({ values: {}, cancelled: false }));
    const wf = linearWorkflow('w', [
      start(),
      userInput('ask', [{ variable: 'token', default: '{{seed}}-x' }]),
      end(),
    ]);
    await new WorkflowEngine(makePorts({ requestInput })).run(wf, { runtime: { seed: 'S' } });

    const sentFields = (requestInput.mock.calls[0] as unknown[])[0] as {
      fields: { default: string }[];
    };
    expect(sentFields.fields[0].default).toBe('S-x');
  });

  it('falls back to evaluated defaults when no input port is provided', async () => {
    const wf = linearWorkflow('w', [
      start(),
      userInput('ask', [{ variable: 'token', default: '{{seed}}!' }]),
      end(),
    ]);
    const result = await new WorkflowEngine(makePorts()).run(wf, { runtime: { seed: 'D' } });

    expect(result.status).toBe('success');
    expect(result.finalVariables).toMatchObject({ token: 'D!' });
  });

  it('fails the node when the user cancels the input', async () => {
    const requestInput = vi.fn(async () => ({ values: {}, cancelled: true }));
    const wf = linearWorkflow('w', [start(), userInput('ask', [{ variable: 'token' }]), end()]);
    const result = await new WorkflowEngine(makePorts({ requestInput })).run(wf);

    expect(result.status).toBe('failed');
    expect(result.nodeResults.find((n) => n.nodeId === 'ask')?.message).toMatch(/cancelled/i);
  });

  it('emits a running then a done progress event for each node', async () => {
    const events: { phase: string; nodeId: string; status?: string }[] = [];
    const onNodeProgress = vi.fn(
      (e: { phase: string; nodeId: string; result?: { status: string } }) =>
        events.push({ phase: e.phase, nodeId: e.nodeId, status: e.result?.status }),
    );
    const wf = linearWorkflow('w', [start(), setVar('v', 'a', '1'), end()]);
    await new WorkflowEngine(makePorts({ onNodeProgress })).run(wf);

    // Each node reports running before done, in execution order.
    expect(events).toEqual([
      { phase: 'running', nodeId: 'start', status: undefined },
      { phase: 'done', nodeId: 'start', status: 'success' },
      { phase: 'running', nodeId: 'v', status: undefined },
      { phase: 'done', nodeId: 'v', status: 'success' },
      { phase: 'running', nodeId: 'end', status: undefined },
      { phase: 'done', nodeId: 'end', status: 'success' },
    ]);
  });
});
