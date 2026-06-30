import type { WorkflowGraph, WorkflowNode } from '@shared/workflow';

/**
 * A runtime variable produced by an upstream workflow step, available to nodes
 * that run after it. Computed purely from the graph (view-layer) to power the
 * "variables from previous steps" autocomplete — it mirrors what the engine
 * threads through its runtime context, without executing anything.
 */
export interface FlowVariable {
  key: string;
  nodeId: string;
  nodeName: string;
  nodeKind: WorkflowNode['kind'];
  /** Short label for how it is produced: 'set', 'transform', 'extract', 'input'. */
  field: string;
}

/** Resolves the variable names a referenced sub-workflow produces. */
export type SubWorkflowVarsResolver = (workflowId: string) => string[];

/**
 * The runtime variable keys a single node writes into the context. A sub-workflow
 * node contributes the variables produced inside the workflow it runs (resolved
 * via `subWorkflowVars`), since the engine threads one shared runtime map through
 * the child — so those values are available to later parent steps.
 */
export function variablesProducedBy(
  node: WorkflowNode,
  subWorkflowVars?: SubWorkflowVarsResolver,
): { key: string; field: string }[] {
  switch (node.kind) {
    case 'set-variable': {
      const key = (node.config as { key?: string }).key?.trim();
      return key ? [{ key, field: 'set' }] : [];
    }
    case 'transform': {
      const key = (node.config as { variable?: string }).variable?.trim();
      return key ? [{ key, field: 'transform' }] : [];
    }
    case 'request': {
      const extract = (node.config as { extract?: { variable?: string }[] }).extract ?? [];
      return extract
        .map((e) => e.variable?.trim())
        .filter((k): k is string => Boolean(k))
        .map((k) => ({ key: k, field: 'extract' }));
    }
    case 'user-input': {
      const fields = (node.config as { fields?: { variable?: string }[] }).fields ?? [];
      return fields
        .map((f) => f.variable?.trim())
        .filter((k): k is string => Boolean(k))
        .map((k) => ({ key: k, field: 'input' }));
    }
    case 'sub-workflow': {
      const id = (node.config as { workflowId?: string }).workflowId;
      if (!id || !subWorkflowVars) return [];
      return subWorkflowVars(id).map((key) => ({ key, field: 'sub-workflow' }));
    }
    default:
      return [];
  }
}

/**
 * All variable names a graph's nodes write directly (no sub-workflow recursion) —
 * used to expose a sub-workflow's outputs to its parent.
 */
export function producedVariableNames(graph: WorkflowGraph): string[] {
  const names = new Set<string>();
  for (const node of graph.nodes) {
    for (const { key } of variablesProducedBy(node)) names.add(key);
  }
  return [...names];
}

function kindLabel(kind: WorkflowNode['kind']): string {
  return kind.replace(/-/g, ' ');
}

/**
 * Variables available to `nodeId` from steps that can run before it: every
 * ancestor reachable by walking the edges backwards. Deduped by key, keeping the
 * nearest producing step (breadth-first from the node). Cycles (loops) are
 * handled via a visited set.
 */
export function upstreamVariables(
  graph: WorkflowGraph,
  nodeId: string,
  subWorkflowVars?: SubWorkflowVarsResolver,
): FlowVariable[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const preds = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = preds.get(e.target) ?? [];
    list.push(e.source);
    preds.set(e.target, list);
  }

  // Breadth-first walk backwards so nearer producers are visited first.
  const seen = new Set<string>([nodeId]);
  const order: string[] = [];
  let frontier = (preds.get(nodeId) ?? []).filter((id) => !seen.has(id));
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      for (const p of preds.get(id) ?? []) if (!seen.has(p)) next.push(p);
    }
    frontier = next;
  }

  const result: FlowVariable[] = [];
  const taken = new Set<string>();
  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    for (const { key, field } of variablesProducedBy(node, subWorkflowVars)) {
      if (taken.has(key)) continue;
      taken.add(key);
      result.push({
        key,
        nodeId: id,
        nodeName: node.name || kindLabel(node.kind),
        nodeKind: node.kind,
        field,
      });
    }
  }
  return result;
}
