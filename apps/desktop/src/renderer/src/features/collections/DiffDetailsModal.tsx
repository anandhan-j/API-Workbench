import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Minus, Pencil, Plus, X } from 'lucide-react';
import type { VersionDiff } from '@shared/version';
import { cn } from '../../lib/cn';

export interface DiffDetailsModalProps {
  diff: VersionDiff;
  title: string;
  onClose: () => void;
}

const METHOD_COLOR: Record<string, string> = {
  GET: 'text-success',
  POST: 'text-warning',
  PUT: 'text-accent',
  PATCH: 'text-violet-400',
  DELETE: 'text-danger',
};

function MethodBadge({ method }: { method: string }): JSX.Element {
  return (
    <span className={cn('w-12 shrink-0 text-[10px] font-bold tracking-wide', METHOD_COLOR[method] ?? 'text-muted')}>
      {method}
    </span>
  );
}

/**
 * A popup detailing exactly which endpoints (and folders) changed between a
 * version and the current collection state, including field-level changes for
 * modified requests.
 */
export function DiffDetailsModal({ diff, title, onClose }: DiffDetailsModalProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const empty =
    diff.addedRequests.length === 0 &&
    diff.removedRequests.length === 0 &&
    diff.modifiedRequests.length === 0 &&
    diff.addedFolders.length === 0 &&
    diff.removedFolders.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change details"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
          {empty && <p className="text-muted">No differences — this version matches the current state.</p>}

          {diff.addedFolders.length > 0 && (
            <Section icon={<Plus size={13} className="text-success" />} label={`Added folders (${diff.addedFolders.length})`}>
              {diff.addedFolders.map((f) => (
                <div key={f.id} className="py-0.5 text-success">📁 {f.name}</div>
              ))}
            </Section>
          )}

          {diff.removedFolders.length > 0 && (
            <Section icon={<Minus size={13} className="text-danger" />} label={`Removed folders (${diff.removedFolders.length})`}>
              {diff.removedFolders.map((f) => (
                <div key={f.id} className="py-0.5 text-danger">📁 {f.name}</div>
              ))}
            </Section>
          )}

          {diff.addedRequests.length > 0 && (
            <Section icon={<Plus size={13} className="text-success" />} label={`Added requests (${diff.addedRequests.length})`}>
              {diff.addedRequests.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-0.5">
                  <MethodBadge method={r.method} />
                  <span className="truncate">{r.name}</span>
                  <span className="truncate text-xs text-muted">{r.url}</span>
                </div>
              ))}
            </Section>
          )}

          {diff.removedRequests.length > 0 && (
            <Section icon={<Minus size={13} className="text-danger" />} label={`Removed requests (${diff.removedRequests.length})`}>
              {diff.removedRequests.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-0.5">
                  <MethodBadge method={r.method} />
                  <span className="truncate">{r.name}</span>
                  <span className="truncate text-xs text-muted">{r.url}</span>
                </div>
              ))}
            </Section>
          )}

          {diff.modifiedRequests.length > 0 && (
            <Section icon={<Pencil size={13} className="text-accent" />} label={`Modified requests (${diff.modifiedRequests.length})`}>
              {diff.modifiedRequests.map((r) => (
                <div key={r.id} className="rounded-md border border-border bg-bg p-2">
                  <p className="mb-1 font-medium">{r.name}</p>
                  <ul className="space-y-0.5">
                    {r.changes.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                        <span className="rounded bg-surface-2 px-1 uppercase text-muted">{c.field}</span>
                        <span className="text-danger line-through">{c.before || '∅'}</span>
                        <ArrowRight size={11} className="text-muted" />
                        <span className="text-success">{c.after || '∅'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ icon, label, children }: { icon: JSX.Element; label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <div className="pl-1">{children}</div>
    </div>
  );
}
