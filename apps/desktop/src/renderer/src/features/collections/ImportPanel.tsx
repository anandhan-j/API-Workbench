import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ImportResult, ImportSource } from '@shared/openapi';
import { cn } from '../../lib/cn';

export interface ImportPanelProps {
  busy?: boolean;
  result?: ImportResult | null;
  error?: string | null;
  /** When true, drops the outer card styling (for use inside a modal). */
  bare?: boolean;
  /** Plugin importers (qualified id + label); empty/absent hides the format select. */
  importers?: { id: string; label: string }[];
  onImport: (payload: { name?: string; source: ImportSource; importerId?: string }) => void;
}

/**
 * Presentational OpenAPI import form: paste a spec (JSON or YAML) or give a URL,
 * optionally name the collection, and import. Stateless about the request itself
 * — it calls `onImport` and renders whatever result/error it is given.
 */
export function ImportPanel({
  busy,
  result,
  error,
  bare,
  importers = [],
  onImport,
}: ImportPanelProps): JSX.Element {
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  // '' = auto-detect (built-ins first); otherwise a qualified plugin importer id.
  const [importerId, setImporterId] = useState('');

  const submit = (): void => {
    const source: ImportSource =
      mode === 'text' ? { type: 'text', content: text } : { type: 'url', url };
    onImport({
      ...(name.trim() ? { name: name.trim() } : {}),
      source,
      ...(importerId ? { importerId } : {}),
    });
  };

  return (
    <div className={cn(!bare && 'rounded-md border border-border bg-surface p-4')}>
      <div className="flex gap-2">
        {(['text', 'url'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md px-3 py-1 text-xs',
              mode === m ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2',
            )}
          >
            {m === 'text' ? 'Paste spec' : 'From URL'}
          </button>
        ))}
      </div>

      {mode === 'text' ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="OpenAPI document"
          placeholder="Paste OpenAPI 3.x or Swagger 2.0 (JSON or YAML)…"
          rows={6}
          className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs"
        />
      ) : (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="OpenAPI URL"
          placeholder="https://example.com/openapi.json"
          className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
      )}

      {importers.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="import-format" className="shrink-0 text-xs text-muted">
            Format
          </label>
          <select
            id="import-format"
            value={importerId}
            onChange={(e) => setImporterId(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
          >
            <option value="">Auto-detect (OpenAPI / Swagger)</option>
            {importers.map((imp) => (
              <option key={imp.id} value={imp.id}>
                {imp.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Collection name (optional)"
          placeholder="Collection name (optional)"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm text-accent-fg disabled:opacity-60"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Import
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {result && (
        <p className="mt-3 text-sm text-success">
          Imported “{result.collectionName}” ({result.specVersion}, {result.format}) —{' '}
          {result.requestsCreated} requests in {result.foldersCreated} folders, {result.schemaCount}{' '}
          schemas.
        </p>
      )}
    </div>
  );
}
