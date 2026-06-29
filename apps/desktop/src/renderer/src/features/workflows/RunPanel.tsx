import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Loader2,
  XCircle,
} from 'lucide-react';
import type { ExecutionResponse } from '@shared/execution';
import type { NodeRunResult, WorkflowNodeKind, WorkflowRunResult } from '@shared/workflow';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/pick-file';
import { Modal } from '../../components/menu/Modal';
import { ResponseViewer } from '../runner/ResponseViewer';
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
  /** The node currently selected on the canvas — scrolls/expands its stage. */
  selectedNodeId?: string | null;
  /** Selecting a stage focuses its node on the canvas. */
  onSelectStage?: (nodeId: string) => void;
}

const rowKey = (n: NodeRunResult, i: number): string => `${n.nodeId}-${i}`;

/**
 * The run results view. While a run is live it streams each completed stage and
 * shows a spinner on the one currently executing; when the run finishes it shows
 * the final status, a per-stage accordion (timing, message, variables written,
 * and — for request stages — the HTTP response), and the final variables. Failed
 * stages auto-expand; selecting a stage focuses its node on the canvas, and the
 * canvas selection scrolls the matching stage into view.
 */
export function RunPanel({
  result,
  running,
  error,
  liveResults,
  current,
  selectedNodeId,
  onSelectStage,
}: RunPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalResponse, setModalResponse] = useState<ExecutionResponse | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // While running, drive the list from the live stream; otherwise the final run.
  const rows = running ? liveResults : (result?.nodeResults ?? liveResults);

  // Auto-expand failed stages so their error is visible without a click.
  useEffect(() => {
    const failed = rows
      .map((n, i) => (n.status === 'failed' ? rowKey(n, i) : null))
      .filter((k): k is string => k !== null);
    if (failed.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      failed.forEach((k) => next.add(k));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, result?.status]);

  // When the canvas selection changes, expand and scroll to the matching stage.
  useEffect(() => {
    if (!selectedNodeId) return;
    const idx = rows.findIndex((n) => n.nodeId === selectedNodeId);
    if (idx === -1) return;
    const key = rowKey(rows[idx], idx);
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    rowRefs.current.get(key)?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  if (error && !running) {
    return <p className="whitespace-pre-wrap break-words p-4 text-sm text-rose-400">{error}</p>;
  }
  if (!running && !result && liveResults.length === 0) {
    return <p className="p-4 text-sm text-muted">Run the workflow to see step-by-step results.</p>;
  }

  const showRunningRow = running && current && !rows.some((r) => r.nodeId === current.nodeId);
  const variables = result ? Object.entries(result.finalVariables) : [];
  const counts = rows.reduce(
    (acc, n) => {
      acc[n.status] += 1;
      return acc;
    },
    { success: 0, failed: 0, skipped: 0 } as Record<NodeRunResult['status'], number>,
  );

  const activate = (node: NodeRunResult, key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    onSelectStage?.(node.nodeId);
  };

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <span className="flex items-center gap-1.5 text-muted">
            <Loader2 size={14} className="animate-spin" /> Running…
          </span>
        ) : result ? (
          <>
            <StatusBadge status={result.status} />
            <span className="text-muted">{result.durationMs} ms</span>
            <span className="ml-auto flex items-center gap-2 text-[11px]">
              {counts.success > 0 && <span className="text-emerald-400">{counts.success} ✓</span>}
              {counts.failed > 0 && <span className="text-rose-400">{counts.failed} ✗</span>}
              {counts.skipped > 0 && (
                <span className="text-amber-400">{counts.skipped} skipped</span>
              )}
            </span>
          </>
        ) : null}
      </div>

      <ol className="flex flex-col gap-1">
        {rows.map((n, i) => {
          const key = rowKey(n, i);
          return (
            <NodeRow
              key={key}
              node={n}
              expanded={expanded.has(key)}
              onActivate={() => activate(n, key)}
              onOpenResponse={setModalResponse}
              registerRef={(el) => {
                if (el) rowRefs.current.set(key, el);
                else rowRefs.current.delete(key);
              }}
            />
          );
        })}
        {showRunningRow && current && <RunningRow node={current} />}
      </ol>

      {!running && variables.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Final variables
          </p>
          <dl className="rounded-md border border-border">
            {variables.map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-3 border-b border-border px-2.5 py-1 last:border-0"
              >
                <dt className="font-mono text-xs text-muted">{k}</dt>
                <dd className="truncate font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {modalResponse && (
        <Modal title="Response" onClose={() => setModalResponse(null)} maxWidth="max-w-4xl">
          <div className="h-[70vh] overflow-auto">
            <ResponseViewer response={modalResponse} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function NodeRow({
  node,
  expanded,
  onActivate,
  onOpenResponse,
  registerRef,
}: {
  node: NodeRunResult;
  expanded: boolean;
  onActivate: () => void;
  onOpenResponse: (response: ExecutionResponse) => void;
  registerRef: (el: HTMLLIElement | null) => void;
}): JSX.Element {
  const meta = NODE_META[node.kind];
  const failed = node.status === 'failed';
  return (
    <li
      ref={registerRef}
      className={cn('rounded-md', failed ? 'bg-rose-500/10' : 'hover:bg-surface-2')}
    >
      <button
        type="button"
        onClick={onActivate}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-2 py-1 text-left"
      >
        {expanded ? (
          <ChevronDown size={13} className="shrink-0 text-muted" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-muted" />
        )}
        <NodeStatusIcon status={node.status} />
        <span className={cn('truncate font-medium', failed && 'text-rose-300')}>
          {node.name || meta.label}
        </span>
        {!expanded && node.message && (
          <span className="ml-auto shrink-0 truncate text-xs text-muted">{node.message}</span>
        )}
        <span
          className={cn(
            'shrink-0 text-[11px] text-muted',
            !(!expanded && node.message) && 'ml-auto',
          )}
        >
          {node.durationMs}ms
        </span>
      </button>
      {expanded && <StageDetails node={node} onOpenResponse={onOpenResponse} />}
    </li>
  );
}

function StageDetails({
  node,
  onOpenResponse,
}: {
  node: NodeRunResult;
  onOpenResponse: (response: ExecutionResponse) => void;
}): JSX.Element {
  const vars = node.variablesSet ? Object.entries(node.variablesSet) : [];
  const meta = NODE_META[node.kind];
  return (
    <div className="flex flex-col gap-2 px-2 pb-2 pl-7 text-xs">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        <span>{meta.label}</span>
        <span>started {new Date(node.startedAt).toLocaleTimeString()}</span>
        <span>{node.durationMs} ms</span>
        {node.attempts && node.attempts > 1 ? <span>{node.attempts} attempts</span> : null}
      </div>

      {node.message && (
        <p
          className={cn(
            'whitespace-pre-wrap break-words rounded px-2 py-1 font-mono text-[11px]',
            node.status === 'failed' ? 'bg-rose-500/10 text-rose-400' : 'bg-surface-2 text-muted',
          )}
        >
          {node.message}
        </p>
      )}

      {vars.length > 0 && (
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Variables set
          </p>
          <dl className="rounded border border-border">
            {vars.map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-2 border-b border-border px-2 py-0.5 last:border-0"
              >
                <dt className="shrink-0 font-mono text-muted">{k}</dt>
                <dd className="truncate font-mono text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {node.response && (
        <ResponseSection response={node.response} onOpen={() => onOpenResponse(node.response!)} />
      )}
    </div>
  );
}

function ResponseSection({
  response,
  onOpen,
}: {
  response: ExecutionResponse;
  onOpen: () => void;
}): JSX.Element {
  const [showHeaders, setShowHeaders] = useState(false);
  const headers = Object.entries(response.headers);
  const isBinary = response.bodyKind === 'binary';
  const body = response.prettyBody ?? response.body;
  return (
    <div className="flex flex-col gap-1.5 rounded border border-border p-1.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
            response.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400',
          )}
        >
          {response.status} {response.statusText}
        </span>
        <span className="truncate text-[11px] text-muted">
          {response.timings.totalMs} ms · {formatBytes(response.sizeBytes)}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto shrink-0 text-[11px] text-accent hover:underline"
        >
          Open full
        </button>
      </div>

      {response.error && <p className="text-[11px] text-rose-400">{response.error}</p>}

      <div>
        <button
          type="button"
          onClick={() => setShowHeaders((s) => !s)}
          aria-expanded={showHeaders}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted"
        >
          {showHeaders ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Headers ({headers.length})
        </button>
        {showHeaders && (
          <dl className="mt-1 rounded border border-border">
            {headers.map(([k, v]) => (
              <div key={k} className="flex gap-2 border-b border-border px-2 py-0.5 last:border-0">
                <dt className="shrink-0 font-mono text-muted">{k}</dt>
                <dd className="truncate font-mono text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div>
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Body</p>
        {isBinary ? (
          <p className="text-[11px] text-muted">binary · {formatBytes(response.sizeBytes)}</p>
        ) : body ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-bg px-2 py-1 font-mono text-[11px] text-fg">
            {body}
          </pre>
        ) : (
          <p className="text-[11px] text-muted">(empty)</p>
        )}
      </div>
    </div>
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
