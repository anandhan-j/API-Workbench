import { BRANCH_KINDS, type WorkflowGraph, type WorkflowNode } from '@shared/workflow';
import { WorkflowError } from './errors';

/**
 * Pure graph utilities for the workflow runtime.
 *
 * From Phase 14 the graph may branch and loop. The structural rules are:
 *  - exactly one `start` node;
 *  - every edge references existing nodes;
 *  - only branch nodes (condition/switch/loop) may have more than one *normal*
 *    outgoing edge. Any node may additionally have one `error` edge (used when
 *    its policy routes failures), so a linear node keeps a single normal
 *    successor plus an optional error path.
 *
 * Cycles are allowed (loops); termination is bounded by per-loop iteration caps
 * and the engine's global step limit rather than by acyclicity.
 */

export const ERROR_HANDLE = 'error';

export interface OutEdge {
  /** The branch label, or null for a linear node's single edge. */
  handle: string | null;
  target: string;
}

export interface GraphIndex {
  byId: Map<string, WorkflowNode>;
  /** node id -> its outgoing edges (label + target). */
  outgoing: Map<string, OutEdge[]>;
}

export function indexGraph(graph: WorkflowGraph): GraphIndex {
  const byId = new Map<string, WorkflowNode>();
  for (const node of graph.nodes) {
    if (byId.has(node.id)) throw new WorkflowError(`Duplicate node id "${node.id}"`);
    byId.set(node.id, node);
  }
  const outgoing = new Map<string, OutEdge[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) {
    if (!byId.has(edge.source)) {
      throw new WorkflowError(`Edge "${edge.id}" has unknown source "${edge.source}"`);
    }
    if (!byId.has(edge.target)) {
      throw new WorkflowError(`Edge "${edge.id}" has unknown target "${edge.target}"`);
    }
    (outgoing.get(edge.source) as OutEdge[]).push({ handle: edge.sourceHandle ?? null, target: edge.target });
  }
  return { byId, outgoing };
}

export function findStart(graph: WorkflowGraph): WorkflowNode {
  const starts = graph.nodes.filter((n) => n.kind === 'start');
  if (starts.length === 0) throw new WorkflowError('Workflow has no start node');
  if (starts.length > 1) throw new WorkflowError('Workflow has more than one start node');
  return starts[0] as WorkflowNode;
}

/** Validates the structural invariants the runtime relies on. */
export function validateGraph(graph: WorkflowGraph): GraphIndex {
  const index = indexGraph(graph);
  findStart(graph);

  for (const [nodeId, edges] of index.outgoing) {
    const node = index.byId.get(nodeId) as WorkflowNode;
    if (BRANCH_KINDS.includes(node.kind)) continue;
    const normal = edges.filter((e) => e.handle !== ERROR_HANDLE);
    if (normal.length > 1) {
      throw new WorkflowError(
        `Node "${nodeId}" (${node.kind}) has ${normal.length} outgoing edges; only condition/switch/loop nodes may branch`,
      );
    }
  }

  return index;
}

/** The outgoing edges of a node. */
export function edgesFrom(index: GraphIndex, nodeId: string): OutEdge[] {
  return index.outgoing.get(nodeId) ?? [];
}

/**
 * Resolves the next node id for a chosen branch handle. For a linear step pass
 * `null` — it returns the single normal (non-error) edge's target. For a branch
 * or an error route, it returns the edge whose handle matches, or undefined when
 * no edge is wired for that branch.
 */
export function resolveTarget(index: GraphIndex, nodeId: string, handle: string | null): string | undefined {
  const edges = edgesFrom(index, nodeId);
  if (handle === null) {
    const normal = edges.find((e) => e.handle === null) ?? edges.find((e) => e.handle !== ERROR_HANDLE);
    return normal?.target;
  }
  return edges.find((e) => e.handle === handle)?.target;
}
