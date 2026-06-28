import { useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import type { AuthConfig, CredentialMeta, SaveCredentialInput } from '@shared/auth';

type QuickType = 'bearer' | 'basic' | 'apiKey';

export interface CredentialsPanelProps {
  scope: string;
  scopeId?: string;
  credentials: CredentialMeta[];
  busy?: boolean;
  onSave: (input: SaveCredentialInput) => void;
  onDelete: (id: string) => void;
}

/**
 * Presentational credentials manager. Lists stored credentials (metadata only —
 * secrets never reach the renderer) and offers a quick-add form for the common
 * schemes. The full scheme set is supported by the engine/IPC; this form covers
 * Bearer, Basic, and API Key.
 */
export function CredentialsPanel({
  scope,
  scopeId,
  credentials,
  busy,
  onSave,
  onDelete,
}: CredentialsPanelProps): JSX.Element {
  const [name, setName] = useState('');
  const [type, setType] = useState<QuickType>('bearer');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');

  const submit = (): void => {
    if (!name.trim()) return;
    let config: AuthConfig;
    if (type === 'bearer') config = { type: 'bearer', token };
    else if (type === 'basic') config = { type: 'basic', username, password };
    else config = { type: 'apiKey', key: apiKeyName, value: apiKeyValue, in: 'header' };
    onSave({ scope, ...(scopeId ? { scopeId } : {}), name: name.trim(), config });
    setName('');
    setToken('');
    setUsername('');
    setPassword('');
    setApiKeyName('');
    setApiKeyValue('');
  };

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={15} /> Credentials
      </h2>

      <ul className="mt-3 space-y-1">
        {credentials.map((c) => (
          <li key={c.id} className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
            <span className="truncate">
              {c.name} <span className="text-xs text-muted">({c.type})</span>
            </span>
            <button type="button" aria-label={`Delete ${c.name}`} className="opacity-0 group-hover:opacity-100" onClick={() => onDelete(c.id)}>
              <Trash2 size={14} className="text-muted hover:text-danger" />
            </button>
          </li>
        ))}
        {credentials.length === 0 && <li className="px-2 py-1.5 text-sm text-muted">No credentials yet.</li>}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Credential name" placeholder="Name" className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value as QuickType)} aria-label="Credential type" className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm">
          <option value="bearer">Bearer</option>
          <option value="basic">Basic</option>
          <option value="apiKey">API Key</option>
        </select>

        {type === 'bearer' && (
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" aria-label="Bearer token" placeholder="Token (supports {{vars}})" className="col-span-2 rounded-md border border-border bg-bg px-3 py-1.5 text-sm" />
        )}
        {type === 'basic' && (
          <>
            <input value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Username" placeholder="Username" className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" aria-label="Password" placeholder="Password" className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm" />
          </>
        )}
        {type === 'apiKey' && (
          <>
            <input value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} aria-label="API key name" placeholder="Header name" className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm" />
            <input value={apiKeyValue} onChange={(e) => setApiKeyValue(e.target.value)} type="password" aria-label="API key value" placeholder="Value" className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm" />
          </>
        )}
      </div>

      <button type="button" onClick={submit} disabled={busy} className="mt-3 rounded-md bg-accent px-4 py-1.5 text-sm text-accent-fg disabled:opacity-60">
        Save credential
      </button>
    </div>
  );
}
