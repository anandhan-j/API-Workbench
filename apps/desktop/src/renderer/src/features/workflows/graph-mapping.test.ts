import { describe, expect, it } from 'vitest';
import type { WorkflowGraph } from '@shared/workflow';
import { GROUP_NODE_TYPE, isElementNode, toFlow, toGraph } from './graph-mapping';

const graph: WorkflowGraph = {
  nodes: [
    { id: 's', kind: 'start', name: 'Start', position: { x: 10, y: 20 }, config: {} },
    { id: 'r', kind: 'request', name: 'Call', position: { x: 200, y: 20 }, config: { type: 'http', payload: { method: 'GET', url: '/x', headers: {}, query: {}, body: { type: 'none' } }, extract: [] } },
  ],
  edges: [{ id: 'e1', source: 's', target: 'r' }],
  groups: [],
};

describe('graph-mapping', () => {
  it('maps a domain graph to React Flow nodes and edges', () => {
    const { nodes, edges } = toFlow(graph);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ id: 's', position: { x: 10, y: 20 } });
    expect(edges[0]).toMatchObject({ id: 'e1', source: 's', target: 'r' });
  });

  it('overlays run statuses onto node data', () => {
    const { nodes } = toFlow(graph, { r: 'failed' });
    const r = nodes.find((n) => n.id === 'r');
    expect(r && isElementNode(r) ? r.data.status : undefined).toBe('failed');
  });

  it('round-trips graph -> flow -> graph', () => {
    const { nodes, edges } = toFlow(graph);
    const back = toGraph(nodes, edges);
    expect(back.nodes.map((n) => n.id)).toEqual(['s', 'r']);
    expect(back.nodes[0].kind).toBe('start');
    expect(back.edges[0]).toMatchObject({ source: 's', target: 'r' });
    expect(back.groups).toEqual([]);
  });

  it('renders a group as a parent node and round-trips absolute positions', () => {
    const grouped: WorkflowGraph = {
      nodes: [
        { id: 'a', kind: 'request', name: 'A', position: { x: 100, y: 100 }, config: { type: 'http', payload: { method: 'GET', url: '', headers: {}, query: {}, body: { type: 'none' } }, extract: [] } },
        { id: 'b', kind: 'set-variable', name: 'B', position: { x: 300, y: 100 }, config: { key: 'k', value: 'v' } },
      ],
      edges: [],
      groups: [{ id: 'g1', name: 'Group', childIds: ['a', 'b'] }],
    };
    const { nodes } = toFlow(grouped);
    const groupNode = nodes.find((n) => n.type === GROUP_NODE_TYPE);
    expect(groupNode).toBeDefined();
    const a = nodes.find((n) => n.id === 'a');
    expect(a?.parentNode).toBe('g1');

    const back = toGraph(nodes, []);
    expect(back.groups).toEqual([{ id: 'g1', name: 'Group', childIds: ['a', 'b'] }]);
    expect(back.nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 100, y: 100 });
    expect(back.nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 300, y: 100 });
  });
});
