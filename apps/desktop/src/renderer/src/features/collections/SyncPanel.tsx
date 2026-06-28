import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ImportSource } from '@shared/openapi';
import type { SyncMode, SyncResult } from '@shared/sync';
import { cn } from '../../lib/cn';

export interface SyncPanelProps {
  busy?: boolean;
  result?: SyncResult | null;
  error?: string | null;
  /** The URL this collection was imported from; pre-fills and defaults to URL mode. */
  defaultUrl?: string | null;
  /** When true, drops the outer card styling (for use inside a modal). */
  bare?: boolean;
  onSync: (payload: { mode: SyncMode; source: ImportSource }) => void;
}

/**
 * Presentational sync form: paste the updated spec (or a URL), choose safe-merge
 * (preserve manual edits) or replace, and see a summary of added / updated /
 * removed / conflicting / preserved requests.
 */
export function SyncPanel({ busy, result, error, defaultUrl, bare, onSync }: SyncPanelProps): JSX.Element {
  const [inputMode, setInputMode] = useState<'text' | 'url'>(defaultUrl ? 'url' : 'text');
  const [mode, setMode] = useState<SyncMode>('safe');
  const [text, setText] = useState('');
  const [url, setUrl] = useState(defaultUrl ?? '');

  const submit = (): void => {
    const source: ImportSource =
      inputMode === 'text' ? { type: 'text', content: text } : { type: 'url', url };
    onSync({ mode, source });
  };

  return (
    <div className={cn(!bare && 'rounded-md border border-border bg-surface p-4')}>
      <div className="flex flex-wrap items-center gap-2">
        {(['text', 'url'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setInputMode(m)}
            className={cn('rounded-md px-3 py-1 text-xs', inputMode === m ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2')}
          >
            {m === 'text' ? 'Paste spec' : 'From URL'}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {(['safe', 'replace'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn('rounded-md px-3 py-1 text-xs capitalize', mode === m ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2')}
          >
            {m === 'safe' ? 'Safe merge' : 'Replace'}
          </button>
        ))}
      </div>

      {inputMode === 'text' ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Updated OpenAPI document"
          placeholder="Paste the updated OpenAPI / Swagger spec…"
          rows={6}
          className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs"
        />
      ) : (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Updated OpenAPI URL"
          placeholder="https://example.com/openapi.json"
          className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted">
          {mode === 'safe'
            ? 'Manual edits are preserved; conflicts are reported, not overwritten.'
            : 'Spec values overwrite local changes.'}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm text-accent-fg disabled:opacity-60"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Synchronize
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {result && (
        <p className="mt-3 text-sm text-fg">
          <span className="text-success">{result.added} added</span>,{' '}
          <span className="text-accent">{result.updated} updated</span>,{' '}
          <span className="text-danger">{result.removed} removed</span>,{' '}
          <span className="text-warning">{result.conflicts} conflicts</span>,{' '}
          {result.preserved} preserved.
        </p>
      )}
    </div>
  );
}
