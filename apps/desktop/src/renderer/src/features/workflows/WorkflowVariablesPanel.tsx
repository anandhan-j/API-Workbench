import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { VariableContext, VariableScope } from '@shared/variable';
import type { WorkflowGraph } from '@shared/workflow';
import { invoke, isBridgeAvailable } from '../../lib/ipc';
import { useVariableKeys } from '../variables/use-variable-keys';
import { groupVariablesByScope } from '../collections/request-variables';
import { variablesProducedBy, workflowUsedVariableNames } from './flow-variables';

/** Runtime here means "produced by a step in this workflow". */
const SCOPE_LABEL: Record<VariableScope, string> = {
  global: 'Global',
  workspace: 'Environment',
  collection: 'Collection',
  folder: 'Folder',
  request: 'Request',
  workflow: 'Workflow',
  runtime: 'Set by a step',
};

export interface WorkflowVariablesPanelProps {
  graph: WorkflowGraph | null;
  variableContext: VariableContext;
  /** Variables a referenced sub-workflow produces (so they count as set-by-step). */
  subWorkflowVars?: (workflowId: string) => string[];
  /** Live runtime values during/after a run, shown for step-produced variables. */
  runtimeValues?: Record<string, string>;
}

/**
 * Lists every `{{variable}}` referenced across the whole workflow, grouped by the
 * scope each resolves from — stored scopes (Environment/Global/Collection) with
 * their value, variables a step sets at runtime, and anything unresolved.
 */
export function WorkflowVariablesPanel({
  graph,
  variableContext,
  subWorkflowVars,
  runtimeValues,
}: WorkflowVariablesPanelProps): JSX.Element {
  const names = useMemo(() => (graph ? workflowUsedVariableNames(graph) : []), [graph]);
  const produced = useMemo(() => {
    const set = new Set<string>();
    if (graph) {
      for (const n of graph.nodes) {
        for (const { key } of variablesProducedBy(n, subWorkflowVars)) set.add(key);
      }
    }
    return set;
  }, [graph, subWorkflowVars]);

  const keys = useVariableKeys(variableContext);
  const scopeByName = useMemo(() => {
    const map = new Map<string, { scope: VariableScope; secret: boolean }>();
    for (const k of keys) map.set(k.key, { scope: k.scope, secret: k.secret });
    return map;
  }, [keys]);

  const values = useQuery({
    queryKey: ['workflowUsedVarValues', names, variableContext],
    queryFn: async () => {
      const entries = await Promise.all(
        names.map(async (name) => {
          if (produced.has(name)) return [name, ''] as const; // set at runtime
          if (scopeByName.get(name)?.secret) return [name, '••••••'] as const;
          const r = await invoke('variable.evaluate', {
            template: `{{${name}}}`,
            context: variableContext,
          });
          return [name, r.value] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, string>;
    },
    enabled: isBridgeAvailable() && names.length > 0,
    staleTime: 2_000,
  });

  if (!graph) {
    return <p className="p-3 text-[11px] text-muted">Open a workflow to see its variables.</p>;
  }
  if (names.length === 0) {
    return <p className="p-3 text-[11px] text-muted">No variables referenced in this workflow.</p>;
  }

  const scopeOf = (name: string): VariableScope | undefined =>
    produced.has(name) ? 'runtime' : scopeByName.get(name)?.scope;
  const { groups, unresolved } = groupVariablesByScope(names, scopeOf);

  const valueFor = (name: string): JSX.Element | string => {
    if (produced.has(name)) {
      const live = runtimeValues?.[name];
      return live !== undefined && live !== '' ? (
        live
      ) : (
        <span className="text-muted/60">set at runtime</span>
      );
    }
    return values.data?.[name] ?? <span className="text-muted/60">…</span>;
  };

  return (
    <div className="flex flex-col gap-2.5 p-2">
      {groups.map(({ scope, names: groupNames }) => (
        <div key={scope}>
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {SCOPE_LABEL[scope]} <span className="text-muted/70">({groupNames.length})</span>
          </p>
          <dl className="rounded border border-border">
            {groupNames.map((name) => (
              <div key={name} className="border-b border-border px-2 py-1 last:border-0">
                <dt className="truncate font-mono text-xs text-accent">{`{{${name}}}`}</dt>
                <dd className="truncate font-mono text-[11px] text-muted">{valueFor(name)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {unresolved.length > 0 && (
        <div>
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
            Unresolved <span className="text-muted/70">({unresolved.length})</span>
          </p>
          <dl className="rounded border border-border">
            {unresolved.map((name) => (
              <div key={name} className="border-b border-border px-2 py-1 last:border-0">
                <dt className="truncate font-mono text-xs text-accent">{`{{${name}}}`}</dt>
                <dd className="font-mono text-[11px] text-warning">unresolved</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
