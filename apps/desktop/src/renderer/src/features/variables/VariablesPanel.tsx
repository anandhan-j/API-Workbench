import { useState } from 'react';
import { KeyRound, Lock, Plus, Trash2 } from 'lucide-react';
import type { Variable } from '@shared/variable';

const SECRET_MASK = '••••••••';

export interface VariablesPanelProps {
  variables: Variable[];
  busy?: boolean;
  error?: string | null;
  onAdd: (input: { key: string; value: string; secret: boolean }) => void;
  onDelete: (key: string) => void;
}

/**
 * Presentational variable manager for a single scope: add a key/value, mark it
 * secret (stored encrypted, shown masked), list the current variables, delete.
 * Secret values are never received from the main process — masked rows show a
 * placeholder instead of plaintext.
 */
export function VariablesPanel({
  variables,
  busy,
  error,
  onAdd,
  onDelete,
}: VariablesPanelProps): JSX.Element {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [secret, setSecret] = useState(false);

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!key.trim()) return;
          onAdd({ key: key.trim(), value, secret });
          setKey('');
          setValue('');
          setSecret(false);
        }}
      >
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Key"
          aria-label="Variable key"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          aria-label="Variable value"
          type={secret ? 'password' : 'text'}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={secret}
            onChange={(e) => setSecret(e.target.checked)}
            aria-label="Secret"
          />
          Secret
        </label>
        <button
          type="submit"
          disabled={busy}
          aria-label="Add variable"
          className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm text-accent-fg disabled:opacity-60"
        >
          <Plus size={14} /> Add
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <ul className="mt-3 space-y-2">
        {variables.map((v) => (
          <li
            key={v.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg p-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              {v.secret ? (
                <Lock size={14} className="shrink-0 text-muted" />
              ) : (
                <KeyRound size={14} className="shrink-0 text-muted" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{v.key}</p>
                <p className="truncate font-mono text-xs text-muted">
                  {v.secret ? SECRET_MASK : (v.value ?? '')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDelete(v.key)}
              aria-label={`Delete ${v.key}`}
              className="shrink-0"
            >
              <Trash2 size={14} className="text-muted hover:text-danger" />
            </button>
          </li>
        ))}
        {variables.length === 0 && (
          <li className="px-1 py-2 text-sm text-muted">
            No variables in this scope yet. Add one above.
          </li>
        )}
      </ul>
    </div>
  );
}
