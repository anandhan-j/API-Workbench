import type { Edge } from 'reactflow';
import type { FlowNode } from './graph-mapping';

/**
 * Pure clipboard core. Given the current element nodes/edges and a selection,
 * it produces fresh copies with new ids: positions are offset, internal edges
 * (those whose endpoints are both in the selection) are re-pointed at the
 * clones, and the start node is never copied (a workflow has exactly one).
 *
 * Keeping this free of React and React Flow makes copy/cut/paste/duplicate
 * deterministic and unit-testable.
 */
export function cloneSelection(
  nodes: FlowNode[],
  edges: Edge[],
  selectedIds: Set<string>,
  newId: () => string,
  offset: { x: number; y: number },
): { nodes: FlowNode[]; edges: Edge[] } {
  const source = nodes.filter((n) => selectedIds.has(n.id) && n.data.kind !== 'start');
  const idMap = new Map<string, string>();
  for (const n of source) idMap.set(n.id, newId());

  const clonedNodes: FlowNode[] = source.map((n) => ({
    ...n,
    id: idMap.get(n.id) as string,
    position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
    selected: true,
    // A clone is detached from any group and from any prior run status.
    parentNode: undefined,
    extent: undefined,
    data: { ...n.data, status: undefined },
  }));

  const clonedEdges: Edge[] = edges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({
      ...e,
      id: `e-${newId()}`,
      source: idMap.get(e.source) as string,
      target: idMap.get(e.target) as string,
      selected: true,
    }));

  return { nodes: clonedNodes, edges: clonedEdges };
}
