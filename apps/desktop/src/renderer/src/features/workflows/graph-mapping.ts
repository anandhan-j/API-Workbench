import type { Edge, Node } from 'reactflow';
import type {
  NodePolicy,
  NodeRunStatus,
  WorkflowGraph,
  WorkflowGroup,
  WorkflowNode,
  WorkflowNodeKind,
} from '@shared/workflow';

/**
 * Pure conversions between the persisted workflow domain graph and the React
 * Flow view model. Per ADR-0005 the domain graph is the single source of truth;
 * React Flow is only a rendering/editing surface, so these mappers carry no
 * execution semantics and are unit-testable without a canvas.
 *
 * Groups (Phase 13) are view-layer metadata: in the domain graph a group is just
 * `{ id, name, childIds }` and node positions are absolute. For React Flow a
 * group becomes a parent node and its children's positions become relative; the
 * mappers convert between the two representations losslessly.
 */

/** A node's run status as shown on the canvas — adds the live `running` state. */
export type NodeDisplayStatus = NodeRunStatus | 'running';

export interface FlowNodeData {
  kind: WorkflowNodeKind;
  name: string;
  config: WorkflowNode['config'];
  /** Reliability policy (Phase 14), edited via the inspector. */
  policy?: NodePolicy;
  /** Overlaid during/after a run to colour the node by outcome (or `running`). */
  status?: NodeDisplayStatus;
}

export interface GroupNodeData {
  name: string;
  /** Injected by the canvas only for the group currently being renamed. */
  editing?: boolean;
  onCommit?: (name: string) => void;
  onCancel?: () => void;
}

export type FlowNode = Node<FlowNodeData>;
export type GroupNode = Node<GroupNodeData>;

export const ELEMENT_NODE_TYPE = 'workbench';
export const GROUP_NODE_TYPE = 'group';

const NODE_W = 176;
const NODE_H = 72;
const GROUP_PADDING = 24;
const GROUP_HEADER = 28;

export function isElementNode(node: Node): node is FlowNode {
  return node.type !== GROUP_NODE_TYPE;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOf(positions: { x: number; y: number }[]): Bounds {
  if (positions.length === 0) return { x: 0, y: 0, width: NODE_W, height: NODE_H };
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + NODE_W;
  const maxY = Math.max(...ys) + NODE_H;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function groupBox(group: WorkflowGroup, byId: Map<string, WorkflowNode>): Bounds {
  const members = group.childIds
    .map((id) => byId.get(id))
    .filter((n): n is WorkflowNode => Boolean(n));
  const b = boundsOf(members.map((m) => m.position));
  return {
    x: b.x - GROUP_PADDING,
    y: b.y - GROUP_PADDING - GROUP_HEADER,
    width: b.width + GROUP_PADDING * 2,
    height: b.height + GROUP_PADDING * 2 + GROUP_HEADER,
  };
}

export function toFlow(
  graph: WorkflowGraph,
  statuses: Record<string, NodeDisplayStatus> = {},
): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const groups = graph.groups ?? [];
  const parentOf = new Map<string, string>();
  const originOf = new Map<string, { x: number; y: number }>();

  const groupNodes: GroupNode[] = groups.map((group) => {
    const box = groupBox(group, byId);
    originOf.set(group.id, { x: box.x, y: box.y });
    for (const childId of group.childIds) parentOf.set(childId, group.id);
    return {
      id: group.id,
      type: GROUP_NODE_TYPE,
      position: { x: box.x, y: box.y },
      data: { name: group.name },
      style: { width: box.width, height: box.height },
      connectable: false,
      deletable: false,
    };
  });

  const elementNodes: FlowNode[] = graph.nodes.map((node) => {
    const parentId = parentOf.get(node.id);
    const origin = parentId ? originOf.get(parentId) : undefined;
    const position = origin
      ? { x: node.position.x - origin.x, y: node.position.y - origin.y }
      : node.position;
    return {
      id: node.id,
      type: ELEMENT_NODE_TYPE,
      position,
      ...(parentId ? { parentNode: parentId, extent: 'parent' as const } : {}),
      data: {
        kind: node.kind,
        name: node.name,
        config: node.config,
        ...(node.policy ? { policy: node.policy } : {}),
        ...(statuses[node.id] ? { status: statuses[node.id] } : {}),
      },
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
  }));

  return { nodes: [...groupNodes, ...elementNodes], edges };
}

export function toGraph(nodes: Node[], edges: Edge[]): WorkflowGraph {
  const originOf = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (n.type === GROUP_NODE_TYPE) originOf.set(n.id, { x: n.position.x, y: n.position.y });
  }

  const elementNodes = nodes.filter(isElementNode);
  const domainNodes: WorkflowNode[] = elementNodes.map((node) => {
    const origin = node.parentNode ? originOf.get(node.parentNode) : undefined;
    const abs = origin
      ? { x: node.position.x + origin.x, y: node.position.y + origin.y }
      : node.position;
    return {
      id: node.id,
      kind: node.data.kind,
      name: node.data.name,
      position: { x: Math.round(abs.x), y: Math.round(abs.y) },
      config: node.data.config,
      ...(node.data.policy ? { policy: node.data.policy } : {}),
    } as WorkflowNode;
  });

  const groups: WorkflowGroup[] = nodes
    .filter((n) => n.type === GROUP_NODE_TYPE)
    .map((g) => ({
      id: g.id,
      name: (g.data as GroupNodeData).name,
      childIds: elementNodes.filter((n) => n.parentNode === g.id).map((n) => n.id),
    }));

  return {
    nodes: domainNodes,
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
    groups,
  };
}
