/**
 * Helpers for the `add_or_update_workflow` tool: summarising a workflow bundle
 * for display and phrasing the mandatory overwrite confirmation.
 *
 * Kept pure (no fs, no MCP server) so the summary/message logic is unit-testable
 * on its own; the tool in `tools.ts` composes these with the filesystem and the
 * elicitation round-trip.
 */

export interface WorkflowSummary {
  /** The root workflow's display name. */
  name: string;
  /** The bundle's `rootId` (the primary workflow's id). */
  rootId: string;
  /** How many workflows the bundle carries (root + any sub-workflows). */
  workflowCount: number;
  /** Nodes in the root workflow's graph. */
  nodeCount: number;
  /** Edges in the root workflow's graph. */
  edgeCount: number;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Extracts the relevant, human-facing details from a workflow export bundle.
 * Defensive: accepts already-validated bundles but also degrades gracefully on a
 * malformed/partial object (so it can describe an existing on-disk file we can
 * parse but not fully trust).
 */
export function summarizeWorkflow(data: unknown): WorkflowSummary {
  const bundle = (data ?? {}) as { rootId?: unknown; workflows?: unknown };
  const workflows = asArray(bundle.workflows) as Array<{
    id?: unknown;
    name?: unknown;
    graph?: unknown;
  }>;
  const rootId = typeof bundle.rootId === 'string' ? bundle.rootId : '';
  const root = workflows.find((w) => w.id === rootId) ?? workflows[0];
  const graph = (root?.graph ?? {}) as { nodes?: unknown; edges?: unknown };

  return {
    name: typeof root?.name === 'string' && root.name.length > 0 ? root.name : '(unnamed)',
    rootId: rootId || (typeof root?.id === 'string' ? root.id : ''),
    workflowCount: workflows.length,
    nodeCount: asArray(graph.nodes).length,
    edgeCount: asArray(graph.edges).length,
  };
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? '' : 's'}`;
}

/** A one-line, human-readable description of a workflow bundle. */
export function formatSummary(s: WorkflowSummary): string {
  const subs = s.workflowCount - 1;
  const extra = subs > 0 ? ` (+${plural(subs, 'sub-workflow')})` : '';
  const id = s.rootId ? ` [${s.rootId}]` : '';
  return `"${s.name}"${id} — ${plural(s.nodeCount, 'node')}, ${plural(s.edgeCount, 'edge')}${extra}`;
}

/**
 * The confirmation text shown before overwriting an existing workflow file. It
 * names the file and spells out what is being replaced and with what, so the
 * user can make an informed yes/no decision.
 */
export function buildOverwriteMessage(
  path: string,
  existing: WorkflowSummary | null,
  incoming: WorkflowSummary,
): string {
  return [
    'This will overwrite an existing workflow file:',
    `  ${path}`,
    '',
    `  Replacing: ${existing ? formatSummary(existing) : '(could not read the existing file)'}`,
    `  With:      ${formatSummary(incoming)}`,
    '',
    'Overwrite the existing workflow?',
  ].join('\n');
}
