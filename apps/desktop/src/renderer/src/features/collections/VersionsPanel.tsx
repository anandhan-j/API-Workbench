import { useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import type { CollectionVersion, VersionDiff } from '@shared/version';
import { DiffDetailsModal } from './DiffDetailsModal';

export interface VersionsPanelProps {
  versions: CollectionVersion[];
  busy?: boolean;
  error?: string | null;
  /** The diff currently displayed, keyed by the version it belongs to. */
  diff?: { versionId: string; data: VersionDiff } | null;
  onSnapshot: (label: string) => void;
  onRestore: (versionId: string) => void;
  onDiff: (versionId: string) => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

/**
 * Presentational version-control panel: capture a labelled snapshot of the
 * collection, list the version history (newest first) with its request/folder
 * counts and spec checksum, view the diff of a version against the current
 * state, and restore the collection to any version.
 */
export function VersionsPanel({
  versions,
  busy,
  error,
  diff,
  onSnapshot,
  onRestore,
  onDiff,
}: VersionsPanelProps): JSX.Element {
  const [label, setLabel] = useState('');
  const [detailsFor, setDetailsFor] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSnapshot(label.trim());
          setLabel('');
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          aria-label="Snapshot label"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm text-accent-fg disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
          Snapshot
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <ul className="mt-3 space-y-2">
        {versions.map((v) => (
          <li key={v.id} className="rounded-md border border-border bg-bg p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  v{v.number}
                  {v.label ? ` · ${v.label}` : ''}
                </p>
                <p className="text-xs text-muted">
                  {v.counts.folders} folders, {v.counts.requests} requests · {formatDate(v.createdAt)}
                  {v.checksum ? ` · spec ${v.checksum.slice(0, 8)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onDiff(v.id)}
                  aria-label={`Diff v${v.number}`}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
                >
                  Diff
                </button>
                <button
                  type="button"
                  onClick={() => onRestore(v.id)}
                  aria-label={`Restore v${v.number}`}
                  className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
                >
                  <RotateCcw size={12} /> Restore
                </button>
              </div>
            </div>

            {diff && diff.versionId === v.id && (
              <p className="mt-2 text-xs text-muted">
                vs current:{' '}
                <span className="text-success">{diff.data.addedRequests.length} added</span>,{' '}
                <span className="text-danger">{diff.data.removedRequests.length} removed</span>,{' '}
                <span className="text-accent">{diff.data.modifiedRequests.length} modified</span>.{' '}
                <button
                  type="button"
                  onClick={() => setDetailsFor(v.id)}
                  className="text-accent underline hover:opacity-80"
                >
                  Details
                </button>
              </p>
            )}

            {diff && diff.versionId === v.id && detailsFor === v.id && (
              <DiffDetailsModal
                diff={diff.data}
                title={`Changes in v${v.number}${v.label ? ` · ${v.label}` : ''} vs current`}
                onClose={() => setDetailsFor(null)}
              />
            )}
          </li>
        ))}
        {versions.length === 0 && (
          <li className="px-1 py-2 text-sm text-muted">
            No versions yet. Snapshot the collection to start tracking changes.
          </li>
        )}
      </ul>
    </div>
  );
}
