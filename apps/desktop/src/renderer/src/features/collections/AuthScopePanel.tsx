import { useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { WireAuthConfig } from '@shared/auth';
import type { ResolvedKey } from '@shared/variable';
import { AuthEditor } from '../runner/AuthEditor';
import type { EditorAuthConfig } from '../runner/build-request';
import { useConfirm } from '../../components/confirm/ConfirmProvider';
import { useToast } from '../../components/toast/ToastProvider';

export interface AuthScopePanelProps {
  title: string;
  subtitle: string;
  /** The saved auth (null = inherit/none per scope); `undefined` while loading. */
  savedAuth: WireAuthConfig | null | undefined;
  loading: boolean;
  suggestions: ResolvedKey[];
  /** Whether the scope may inherit (folders yes; the collection is the top of the chain). */
  allowInherit: boolean;
  saving: boolean;
  applying: boolean;
  applyLabel: string;
  applyConfirmTitle: string;
  applyConfirmMessage: string;
  infoText: ReactNode;
  onSave: (auth: WireAuthConfig) => Promise<unknown>;
  onApplyToChildren: () => Promise<{ folders: number; requests: number }>;
  /** Called after a successful cascade settles (used to refresh open editors). */
  onApplied?: () => void;
  onClose: () => void;
}

const DEFAULT_AUTH: EditorAuthConfig = { type: 'none' };

/**
 * Shared right-pane editor for a scope's authorization (a folder or a
 * collection). Owns the local draft (seeded from the saved value, re-seeding
 * whenever it changes so external cascades reflect immediately), the save and
 * "apply to children" actions, and their confirm/toast feedback.
 */
export function AuthScopePanel({
  title,
  subtitle,
  savedAuth,
  loading,
  suggestions,
  allowInherit,
  saving,
  applying,
  applyLabel,
  applyConfirmTitle,
  applyConfirmMessage,
  infoText,
  onSave,
  onApplyToChildren,
  onApplied,
  onClose,
}: AuthScopePanelProps): JSX.Element {
  const confirm = useConfirm();
  const toast = useToast();
  const [auth, setAuth] = useState<EditorAuthConfig>(
    (savedAuth as EditorAuthConfig | null) ?? DEFAULT_AUTH,
  );

  // Re-seed whenever the saved value changes (initial load, or an external
  // cascade that invalidated and refetched this scope).
  useEffect(() => {
    if (savedAuth !== undefined) setAuth((savedAuth as EditorAuthConfig | null) ?? DEFAULT_AUTH);
  }, [savedAuth]);

  const save = (): void => {
    onSave(auth as WireAuthConfig)
      .then(() => toast('Authorization saved'))
      .catch(() => toast('Failed to save authorization', { type: 'error' }));
  };

  const applyToAll = async (): Promise<void> => {
    if (!(await confirm({ title: applyConfirmTitle, message: applyConfirmMessage, confirmLabel: 'Apply' }))) {
      return;
    }
    try {
      const r = await onApplyToChildren();
      toast(`Set ${r.folders} folder(s) and ${r.requests} request(s) to inherit`);
      onApplied?.();
    } catch {
      toast('Failed to apply to children', { type: 'error' });
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-xs text-muted hover:text-fg">
          Close
        </button>
      </div>

      {loading ? (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      ) : (
        <div className="space-y-4">
          <AuthEditor
            auth={auth}
            onChange={setAuth}
            suggestions={suggestions}
            allowInherit={allowInherit}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save authorization'}
            </button>
            <button
              type="button"
              onClick={applyToAll}
              disabled={applying}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-60"
            >
              {applying && <Loader2 size={13} className="animate-spin" />}
              {applying ? 'Applying…' : applyLabel}
            </button>
          </div>
          <p className="text-xs text-muted">{infoText}</p>
        </div>
      )}
    </div>
  );
}
