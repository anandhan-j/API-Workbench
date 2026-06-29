import { CheckCircle2, CircleSlash, Loader2, XCircle } from 'lucide-react';
import type { NodeRunResult, WorkflowNodeKind, WorkflowRunResult } from '@shared/workflow';
import { cn } from '../../lib/cn';
import { NODE_META } from './node-meta';

/** The stage currently executing (shown with a spinner while a run is live). */
export interface RunningNode {
  nodeId: string;
  kind: WorkflowNodeKind;
  name: string;
}

interface RunPanelProps {
  result: WorkflowRunResult | null;
  running: boolean;
  error: string | null;
  /** Per-node results streamed live during a run. */
  liveResults: NodeRunResult[];
  /** The stage currently executing, if any. */
  current: RunningNode | null;
}

/**
 * The run results view. While a run is live it streams each completed stage and
 * shows a spinner on the one currently executing; when the run finishes it shows
 * the final status, per-node results, and final variables. Failed stages are
 * highlighted in red with their full error message.
 */
export function RunPanel({ result, running, error, liveResults, current }: RunPanelProps): JSX.Element {
  if (error && !running) {
    return <p className="whitespace-pre-wrap break-words p-4 text-sm text-rose-400">{error}</p>;
  }
  if (!running && !result && liveResults.length === 0) {
    return <p className="p-4 text-sm text-muted">Run the workflow to see step-by-step results.</p>;
  }

  // While running, drive the list from the live stream; otherwise the final run.
  const rows = running ? liveResults : (result?.nodeResults ?? liveResults);
  const showRunningRow = running && current && !rows.some((r) => r.nodeId === current.nodeId);
  const variables = result ? Object.entries(result.finalVariables) : [];

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex items-center gap-2">
        {running ? (
          <span className="flex items-center gap-1.5 text-muted">
            <Loader2 size={14} className="animate-spin" /> Running…
          </span>
        ) : result ? (
          <>
            <StatusBadge status={result.status} />
            <span className="text-muted">{result.durationMs} ms</span>
          </>
        ) : null}
      </div>

      <ol className="flex flex-col gap-1">
        {rows.map((n, i) => (
          <NodeRow key={`${n.nodeId}-${i}`} node={n} />
        ))}
        {showRunningRow && current && <RunningRow node={current} />}
      </ol>

      {!running && variables.length > 0 && (
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
  const failed = node.status === 'failed';
  return (
    <li className={cn('rounded-md px-2 py-1', failed ? 'bg-rose-500/10' : 'hover:bg-surface-2')}>
      <div className="flex items-center gap-2">
        <NodeStatusIcon status={node.status} />
        <span className={cn('truncate font-medium', failed && 'text-rose-300')}>
          {node.name || meta.label}
        </span>
        {!failed && (
          <span className="ml-auto shrink-0 truncate text-xs text-muted">{node.message ?? ''}</span>
        )}
        <span className="shrink-0 text-[11px] text-muted">{node.durationMs}ms</span>
      </div>
      {failed && node.message && (
        <p className="mt-1 whitespace-pre-wrap break-words rounded bg-rose-500/10 px-2 py-1 font-mono text-[11px] text-rose-400">
          {node.message}
        </p>
      )}
    </li>
  );
}

function RunningRow({ node }: { node: RunningNode }): JSX.Element {
  const meta = NODE_META[node.kind];
  return (
    <li className="flex items-center gap-2 rounded-md bg-accent/10 px-2 py-1">
      <Loader2 size={15} className="shrink-0 animate-spin text-accent" />
      <span className="truncate font-medium">{node.name || meta.label}</span>
      <span className="ml-auto shrink-0 text-[11px] text-accent">running…</span>
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
