import { describe, expect, it } from 'vitest';
import type { Edge } from 'reactflow';
import type { FlowNode } from './graph-mapping';
import { cloneSelection } from './selection-clone';

function el(id: string, kind: FlowNode['data']['kind'], x = 0, y = 0): FlowNode {
  return { id, type: 'workbench', position: { x, y }, data: { kind, name: id, config: {} as never } };
}

describe('cloneSelection', () => {
  const nodes: FlowNode[] = [el('start', 'start'), el('a', 'request', 100, 0), el('b', 'set-variable', 200, 0)];
  const edges: Edge[] = [
    { id: 'e-start-a', source: 'start', target: 'a' },
    { id: 'e-a-b', source: 'a', target: 'b' },
  ];

  it('clones selected nodes with fresh ids and an offset', () => {
    let i = 0;
    const newId = (): string => `new${i++}`;
    const { nodes: cn } = cloneSelection(nodes, edges, new Set(['a', 'b']), newId, { x: 10, y: 20 });
    expect(cn).toHaveLength(2);
    expect(cn.map((n) => n.id)).not.toContain('a');
    expect(cn[0].position).toEqual({ x: 110, y: 20 });
    expect(cn.every((n) => n.selected)).toBe(true);
  });

  it('remaps only internal edges (both endpoints selected)', () => {
    let i = 0;
    const newId = (): string => `id${i++}`;
    const { nodes: cn, edges: ce } = cloneSelection(nodes, edges, new Set(['a', 'b']), newId, { x: 0, y: 0 });
    // start->a is not internal (start not selected), so it is dropped.
    expect(ce).toHaveLength(1);
    const ids = new Set(cn.map((n) => n.id));
    expect(ids.has(ce[0].source)).toBe(true);
    expect(ids.has(ce[0].target)).toBe(true);
  });

  it('never clones the start node even if selected', () => {
    const { nodes: cn } = cloneSelection(nodes, edges, new Set(['start', 'a']), () => 'x', { x: 0, y: 0 });
    expect(cn).toHaveLength(1);
    expect(cn[0].data.kind).toBe('request');
  });

  it('clears run status on clones', () => {
    const withStatus: FlowNode[] = [{ ...el('a', 'request'), data: { kind: 'request', name: 'a', config: {} as never, status: 'failed' } }];
    const { nodes: cn } = cloneSelection(withStatus, [], new Set(['a']), () => 'x', { x: 0, y: 0 });
    expect(cn[0].data.status).toBeUndefined();
  });
});
