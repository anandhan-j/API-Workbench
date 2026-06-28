import type { AuthConfig, AuthType } from '@shared/auth';
import type { ResolvedKey } from '@shared/variable';
import { VariableField } from '../variables/VariableField';

export interface AuthEditorProps {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
  suggestions?: ResolvedKey[];
}

const TYPES: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'No Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apiKey', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth 2.0' },
];

function defaultFor(type: AuthType): AuthConfig {
  switch (type) {
    case 'bearer':
      return { type: 'bearer', token: '' };
    case 'basic':
      return { type: 'basic', username: '', password: '' };
    case 'apiKey':
      return { type: 'apiKey', key: '', value: '', in: 'header' };
    case 'oauth2':
      return { type: 'oauth2', accessToken: '', headerPrefix: 'Bearer' };
    default:
      return { type: 'none' };
  }
}

const field = 'w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm';

/** Authorization tab: scheme selector + variable-aware fields for each scheme. */
export function AuthEditor({ auth, onChange, suggestions = [] }: AuthEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <select
        aria-label="Auth type"
        value={auth.type}
        onChange={(e) => onChange(defaultFor(e.target.value as AuthType))}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {auth.type === 'bearer' && (
        <VariableField className={field} aria-label="Token" placeholder="Token (supports {{vars}})" suggestions={suggestions} value={auth.token} onChange={(v) => onChange({ ...auth, token: v })} />
      )}
      {auth.type === 'basic' && (
        <div className="grid grid-cols-2 gap-2">
          <VariableField className={field} aria-label="Username" placeholder="Username" suggestions={suggestions} value={auth.username} onChange={(v) => onChange({ ...auth, username: v })} />
          <VariableField className={field} aria-label="Password" placeholder="Password" suggestions={suggestions} value={auth.password} onChange={(v) => onChange({ ...auth, password: v })} />
        </div>
      )}
      {auth.type === 'apiKey' && (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <VariableField className={field} aria-label="Key" placeholder="Key" suggestions={suggestions} value={auth.key} onChange={(v) => onChange({ ...auth, key: v })} />
          <VariableField className={field} aria-label="Value" placeholder="Value" suggestions={suggestions} value={auth.value} onChange={(v) => onChange({ ...auth, value: v })} />
          <select className="rounded-md border border-border bg-bg px-2 text-sm" aria-label="Add to" value={auth.in} onChange={(e) => onChange({ ...auth, in: e.target.value as 'header' | 'query' })}>
            <option value="header">Header</option>
            <option value="query">Query</option>
          </select>
        </div>
      )}
      {auth.type === 'oauth2' && (
        <VariableField className={field} aria-label="Access token" placeholder="Access token" suggestions={suggestions} value={auth.accessToken} onChange={(v) => onChange({ ...auth, accessToken: v })} />
      )}
      {auth.type === 'none' && <p className="text-sm text-muted">This request does not use authorization.</p>}
    </div>
  );
}
