import { CheckCircle2, CircleSlash, Loader2, XCircle } from 'lucide-react';
import type { NodeRunResult, WorkflowRunResult } from '@shared/workflow';
import { NODE_META } from './node-meta';

interface RunPanelProps {
  result: WorkflowRunResult | null;
  running: boolean;
  error: string | null;
}

/** Read-only view of the most recent run: overall status, per-node, variables. */
export function RunPanel({ result, running, error }: RunPanelProps): JSX.Element {
  if (running) {
    return (
      <p className="flex items-center gap-1.5 p-4 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Running workflow…
      </p>
    );
  }
  if (error) {
    return <p className="p-4 text-sm text-rose-400">{error}</p>;
  }
  if (!result) {
    return <p className="p-4 text-sm text-muted">Run the workflow to see step-by-step results.</p>;
  }

  const variables = Object.entries(result.finalVariables);
  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex items-center gap-2">
        <StatusBadge status={result.status} />
        <span className="text-muted">{result.durationMs} ms</span>
      </div>

      <ol className="flex flex-col gap-1">
        {result.nodeResults.map((n, i) => (
          <NodeRow key={`${n.nodeId}-${i}`} node={n} />
        ))}
      </ol>

      {variables.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Final variables
          </p>
          <dl className="rounded-md border border-border">
            {variables.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-border px-2.5 py-1 last:border-0">
                <dt className="font-mono text-xs text-muted">{k}</dt>
                <dd className="truncate font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function NodeRow({ node }: { node: NodeRunResult }): JSX.Element {
  const meta = NODE_META[node.kind];
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-surface-2">
      <NodeStatusIcon status={node.status} />
      <span className="truncate font-medium">{node.name || meta.label}</span>
      <span className="ml-auto shrink-0 truncate text-xs text-muted">{node.message ?? ''}</span>
      <span className="shrink-0 text-[11px] text-muted">{node.durationMs}ms</span>
    </li>
  );
}

function StatusBadge({ status }: { status: WorkflowRunResult['status'] }): JSX.Element {
  const map = {
    success: { label: 'Success', cls: 'bg-emerald-500/15 text-emerald-400' },
    failed: { label: 'Failed', cls: 'bg-rose-500/15 text-rose-400' },
    cancelled: { label: 'Cancelled', cls: 'bg-amber-500/15 text-amber-400' },
  } as const;
  const s = map[status];
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function NodeStatusIcon({ status }: { status: NodeRunResult['status'] }): JSX.Element {
  if (status === 'success') return <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />;
  if (status === 'failed') return <XCircle size={15} className="shrink-0 text-rose-400" />;
  return <CircleSlash size={15} className="shrink-0 text-amber-400" />;
}
