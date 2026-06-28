import type { Node } from 'reactflow';
import { GROUP_NODE_TYPE, boundsOf, isElementNode } from './graph-mapping';

/**
 * Pure helpers that add/remove a visual group in the React Flow node array.
 * Grouping reparents the selected element nodes under a new group node and makes
 * their positions relative to it; ungrouping reverses that, restoring absolute
 * positions. These are view-layer operations only — the domain graph derives
 * groups from this structure (see graph-mapping) and the runtime ignores them.
 */

const GROUP_PADDING = 24;
const GROUP_HEADER = 28;

/** Groups the currently-selected, not-yet-grouped element nodes under a new group. */
export function groupSelection(
  nodes: Node[],
  selectedIds: Set<string>,
  groupId: string,
  name: string,
): Node[] {
  const members = nodes.filter(
    (n) => isElementNode(n) && selectedIds.has(n.id) && !n.parentNode,
  );
  if (members.length < 2) return nodes; // nothing meaningful to group

  const b = boundsOf(members.map((m) => m.position));
  const origin = { x: b.x - GROUP_PADDING, y: b.y - GROUP_PADDING - GROUP_HEADER };
  const groupNode: Node = {
    id: groupId,
    type: GROUP_NODE_TYPE,
    position: origin,
    data: { name },
    style: { width: b.width + GROUP_PADDING * 2, height: b.height + GROUP_PADDING * 2 + GROUP_HEADER },
    connectable: false,
    deletable: false,
  };

  const memberIds = new Set(members.map((m) => m.id));
  const reparented = nodes.map((n) =>
    memberIds.has(n.id)
      ? {
          ...n,
          parentNode: groupId,
          extent: 'parent' as const,
          position: { x: n.position.x - origin.x, y: n.position.y - origin.y },
        }
      : n,
  );

  // The group node must precede its children in the array.
  return [groupNode, ...reparented];
}

/** Dissolves a group, restoring its children to absolute positions. */
export function ungroup(nodes: Node[], groupId: string): Node[] {
  const group = nodes.find((n) => n.id === groupId && n.type === GROUP_NODE_TYPE);
  if (!group) return nodes;
  const origin = group.position;
  return nodes
    .filter((n) => n.id !== groupId)
    .map((n) =>
      n.parentNode === groupId
        ? {
            ...n,
            parentNode: undefined,
            extent: undefined,
            position: { x: n.position.x + origin.x, y: n.position.y + origin.y },
          }
        : n,
    );
}
