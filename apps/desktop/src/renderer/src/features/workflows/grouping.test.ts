import { describe, expect, it } from 'vitest';
import type { Node } from 'reactflow';
import { groupSelection, ungroup } from './grouping';

function el(id: string, x: number, y: number): Node {
  return { id, type: 'workbench', position: { x, y }, data: { kind: 'request', name: id, config: {} } };
}

describe('grouping', () => {
  it('groups selected element nodes under a new parent with relative positions', () => {
    const nodes = [el('a', 100, 100), el('b', 300, 100)];
    const out = groupSelection(nodes, new Set(['a', 'b']), 'g1', 'My group');

    const group = out.find((n) => n.id === 'g1');
    expect(group?.type).toBe('group');
    expect(out[0].id).toBe('g1'); // parent precedes children

    const a = out.find((n) => n.id === 'a');
    expect(a?.parentNode).toBe('g1');
    // Position is now relative to the group origin (above/left of the members).
    expect(a?.position.x).toBeGreaterThanOrEqual(0);
    expect(a?.position.y).toBeGreaterThanOrEqual(0);
  });

  it('is a no-op when fewer than two nodes are selected', () => {
    const nodes = [el('a', 0, 0), el('b', 50, 0)];
    expect(groupSelection(nodes, new Set(['a']), 'g', 'g')).toBe(nodes);
  });

  it('round-trips group then ungroup back to absolute positions', () => {
    const nodes = [el('a', 100, 100), el('b', 300, 140)];
    const grouped = groupSelection(nodes, new Set(['a', 'b']), 'g1', 'g');
    const restored = ungroup(grouped, 'g1');

    expect(restored.find((n) => n.id === 'g1')).toBeUndefined();
    const a = restored.find((n) => n.id === 'a');
    const b = restored.find((n) => n.id === 'b');
    expect(a?.parentNode).toBeUndefined();
    expect(a?.position).toEqual({ x: 100, y: 100 });
    expect(b?.position).toEqual({ x: 300, y: 140 });
  });
});
