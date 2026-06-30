import { describe, expect, it } from 'vitest';
import type { WorkflowGraph, WorkflowNode } from '@shared/workflow';
import { producedVariableNames, upstreamVariables, variablesProducedBy } from './flow-variables';

function node(
  id: string,
  kind: WorkflowNode['kind'],
  config: Record<string, unknown> = {},
  name = '',
): WorkflowNode {
  return { id, kind, name, position: { x: 0, y: 0 }, config } as WorkflowNode;
}

const graph: WorkflowGraph = {
  nodes: [
    node('s', 'start'),
    node('r1', 'request', { extract: [{ variable: 'token' }, { variable: '' }] }, 'Login'),
    node('v1', 'set-variable', { key: 'userId' }, 'Set user'),
    node('u1', 'user-input', { fields: [{ variable: 'pin' }] }, 'Ask PIN'),
    node('t', 'condition', { expression: '' }, 'Check'),
    node('e', 'end'),
  ],
  edges: [
    { id: 'e1', source: 's', target: 'r1' },
    { id: 'e2', source: 'r1', target: 'v1' },
    { id: 'e3', source: 'v1', target: 'u1' },
    { id: 'e4', source: 'u1', target: 't' },
    { id: 'e5', source: 't', target: 'e' },
  ],
  groups: [],
};

describe('variablesProducedBy', () => {
  it('reads the produced key per node kind', () => {
    expect(variablesProducedBy(node('x', 'set-variable', { key: 'a' }))).toEqual([
      { key: 'a', field: 'set' },
    ]);
    expect(variablesProducedBy(node('x', 'transform', { variable: 'b' }))).toEqual([
      { key: 'b', field: 'transform' },
    ]);
    expect(
      variablesProducedBy(
        node('x', 'request', { extract: [{ variable: 'c' }, { variable: 'd' }] }),
      ),
    ).toHaveLength(2);
    expect(variablesProducedBy(node('x', 'delay', { ms: 1 }))).toEqual([]);
  });

  it('ignores blank variable names', () => {
    expect(variablesProducedBy(node('x', 'set-variable', { key: '   ' }))).toEqual([]);
  });
});

describe('upstreamVariables', () => {
  it('collects variables from all ancestors, nearest-first', () => {
    const up = upstreamVariables(graph, 't');
    expect(up.map((v) => v.key)).toEqual(['pin', 'userId', 'token']);
    expect(up.find((v) => v.key === 'token')?.nodeName).toBe('Login');
    expect(up.find((v) => v.key === 'userId')?.field).toBe('set');
  });

  it('returns nothing for a node with no producing ancestors', () => {
    expect(upstreamVariables(graph, 's')).toEqual([]);
    expect(upstreamVariables(graph, 'r1')).toEqual([]);
  });

  it('terminates on cycles (loops)', () => {
    const cyclic: WorkflowGraph = {
      ...graph,
      edges: [...graph.edges, { id: 'e6', source: 't', target: 'r1' }],
    };
    expect(
      upstreamVariables(cyclic, 't')
        .map((v) => v.key)
        .sort(),
    ).toEqual(['pin', 'token', 'userId']);
  });
});

describe('sub-workflow variable exposure', () => {
  const childGraph: WorkflowGraph = {
    nodes: [
      node('s', 'start'),
      node('v', 'set-variable', { key: 'token' }),
      node('t', 'transform', { variable: 'userId' }),
      node('e', 'end'),
    ],
    edges: [],
    groups: [],
  };

  it('producedVariableNames lists every variable a graph writes', () => {
    expect(producedVariableNames(childGraph).sort()).toEqual(['token', 'userId']);
  });

  it("exposes a sub-workflow's outputs to later parent steps via the resolver", () => {
    const parent: WorkflowGraph = {
      nodes: [
        node('s', 'start'),
        node('sub', 'sub-workflow', { workflowId: 'child1' }, 'Login flow'),
        node('c', 'condition', { expression: '' }, 'Check'),
        node('e', 'end'),
      ],
      edges: [
        { id: 'e1', source: 's', target: 'sub' },
        { id: 'e2', source: 'sub', target: 'c' },
        { id: 'e3', source: 'c', target: 'e' },
      ],
      groups: [],
    };
    const resolver = (id: string): string[] => (id === 'child1' ? ['token', 'userId'] : []);

    const up = upstreamVariables(parent, 'c', resolver);
    expect(up.map((v) => v.key).sort()).toEqual(['token', 'userId']);
    expect(up.every((v) => v.field === 'sub-workflow')).toBe(true);
    expect(up.find((v) => v.key === 'token')?.nodeName).toBe('Login flow');
  });

  it('contributes nothing without a resolver', () => {
    expect(variablesProducedBy(node('sub', 'sub-workflow', { workflowId: 'x' }))).toEqual([]);
  });
});
