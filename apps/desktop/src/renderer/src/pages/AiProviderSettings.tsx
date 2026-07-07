import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import type { AiModelInfo, AiProviderConfig, AiProviderKind, SaveAiProviderInput } from '@shared/ai';
import { invoke, isBridgeAvailable } from '../lib/ipc';

const KIND_LABEL: Record<AiProviderKind, string> = {
  anthropic: 'Anthropic (Claude)',
  'openai-compat': 'OpenAI-compatible',
};

interface HeaderRow {
  key: string;
  value: string;
}

interface Draft {
  kind: AiProviderKind;
  label: string;
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
  headers: HeaderRow[];
}

const EMPTY_DRAFT: Draft = {
  kind: 'anthropic',
  label: '',
  baseUrl: '',
  defaultModel: 'claude-opus-4-8',
  apiKey: '',
  headers: [],
};

/** Collapses the editable header rows into a record, dropping blank keys. */
function headersToRecord(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = row.value;
  }
  return out;
}

/** Suggested defaults so a user can fill the form with one click per vendor. */
const PRESETS: Record<AiProviderKind, { label: string; baseUrl: string; defaultModel: string }> = {
  anthropic: { label: 'Claude', baseUrl: '', defaultModel: 'claude-opus-4-8' },
  'openai-compat': { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
};

type VerifyState = { id: string; status: 'testing' | 'ok' | 'error'; message?: string } | null;

/** Settings section for bring-your-own-key AI providers (ADR-0012). */
export function AiProviderSettings(): JSX.Element {
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<VerifyState>(null);
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const load = (): void => {
    void invoke('ai.providers.list', {})
      .then(setProviders)
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!isBridgeAvailable()) return;
    load();
  }, []);

  if (!isBridgeAvailable()) {
    return (
      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">AI Providers</h3>
        <p className="mt-3 text-sm text-muted">
          AI providers are available when running inside the desktop app.
        </p>
      </section>
    );
  }

  const resetModels = (): void => {
    setModels([]);
    setModelsError(null);
  };

  const formOpen = adding || editingId !== null;

  const applyKind = (kind: AiProviderKind): void => {
    const preset = PRESETS[kind];
    setDraft((d) => ({ ...d, kind, baseUrl: preset.baseUrl, defaultModel: preset.defaultModel }));
    resetModels();
  };

  const startEdit = (provider: AiProviderConfig): void => {
    setEditingId(provider.id);
    setAdding(false);
    setVerify(null);
    resetModels();
    setDraft({
      kind: provider.kind,
      label: provider.label,
      baseUrl: provider.baseUrl ?? '',
      defaultModel: provider.defaultModel,
      apiKey: '', // never returned; blank means "keep the stored key"
      headers: Object.entries(provider.headers).map(([key, value]) => ({ key, value })),
    });
  };

  const closeForm = (): void => {
    setAdding(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    resetModels();
  };

  const loadModels = (): void => {
    // When editing without re-entering the key, list models with the stored credential.
    const useStoredKey = editingId !== null && !draft.apiKey.trim();
    if (!draft.apiKey.trim() && !useStoredKey) return;
    setLoadingModels(true);
    setModelsError(null);
    void invoke('ai.providers.listModels', {
      ...(useStoredKey && editingId ? { id: editingId } : {}),
      kind: draft.kind,
      baseUrl: draft.baseUrl.trim() || null,
      headers: headersToRecord(draft.headers),
      ...(draft.apiKey.trim() ? { apiKey: draft.apiKey } : {}),
    })
      .then((res) => {
        if (res.ok) {
          setModels(res.models);
          if (res.models.length === 0) setModelsError('The provider returned no models.');
          // Pre-select the first model if the field is empty.
          setDraft((d) => (d.defaultModel.trim() || !res.models[0] ? d : { ...d, defaultModel: res.models[0].id }));
        } else {
          setModelsError(res.error ?? 'Failed to load models.');
        }
      })
      .catch((error: unknown) =>
        setModelsError(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setLoadingModels(false));
  };

  const save = (): void => {
    if (!draft.label.trim() || !draft.defaultModel.trim()) return;
    // A key is required to create; when editing, blank keeps the stored key.
    if (!editingId && !draft.apiKey.trim()) return;
    if (draft.kind === 'openai-compat' && !draft.baseUrl.trim()) return;
    setBusy(true);
    const input: SaveAiProviderInput = {
      ...(editingId ? { id: editingId } : {}),
      kind: draft.kind,
      label: draft.label.trim(),
      // A gateway URL is optional for Anthropic (blank = api.anthropic.com) and required for openai-compat.
      baseUrl: draft.baseUrl.trim() || null,
      defaultModel: draft.defaultModel.trim(),
      headers: headersToRecord(draft.headers),
      ...(draft.apiKey.trim() ? { apiKey: draft.apiKey } : {}),
    };
    void invoke('ai.providers.save', input)
      .then(() => {
        closeForm();
        load();
      })
      .finally(() => setBusy(false));
  };

  const remove = (id: string): void => {
    void invoke('ai.providers.delete', { id }).then(load).catch(() => undefined);
  };

  const test = (provider: AiProviderConfig): void => {
    setVerify({ id: provider.id, status: 'testing' });
    void invoke('ai.providers.verify', { id: provider.id })
      .then((result) =>
        setVerify({
          id: provider.id,
          status: result.ok ? 'ok' : 'error',
          message: result.ok ? 'Key verified' : result.error,
        }),
      )
      .catch((error: unknown) =>
        setVerify({
          id: provider.id,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
  };

  return (
    <section className="mt-4 rounded-lg border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold">AI Providers</h3>
      <p className="mt-1 text-sm text-muted">
        Connect an LLM with your own API key to power the in-app assistant. Keys are encrypted on
        this device and used only to reach the provider you choose.
      </p>

      <div className="mt-4 space-y-2">
        {providers.length === 0 && (
          <p className="text-sm text-muted">No providers yet. Add one below.</p>
        )}
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{provider.label}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                  {KIND_LABEL[provider.kind]}
                </span>
                {!provider.hasKey && (
                  <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">
                    no key
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-muted">
                {provider.defaultModel}
                {provider.baseUrl ? ` · ${provider.baseUrl}` : ''}
                {Object.keys(provider.headers).length > 0
                  ? ` · +${Object.keys(provider.headers).length} header(s)`
                  : ''}
              </p>
              {verify?.id === provider.id && verify.status !== 'testing' && (
                <p
                  className={`mt-1 flex items-center gap-1 text-xs ${
                    verify.status === 'ok' ? 'text-success' : 'text-danger'
                  }`}
                >
                  {verify.status === 'ok' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {verify.message}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => test(provider)}
                disabled={verify?.id === provider.id && verify.status === 'testing'}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-fg"
              >
                {verify?.id === provider.id && verify.status === 'testing' ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  'Test'
                )}
              </button>
              <button
                type="button"
                onClick={() => startEdit(provider)}
                aria-label={`Edit ${provider.label}`}
                className="rounded-md p-1.5 text-muted hover:text-fg"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => remove(provider.id)}
                aria-label={`Delete ${provider.label}`}
                className="rounded-md p-1.5 text-muted hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {formOpen ? (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-bg p-4">
          <p className="text-xs font-semibold text-fg">
            {editingId ? 'Edit provider' : 'New provider'}
          </p>
          <div className="flex gap-2">
            {(Object.keys(KIND_LABEL) as AiProviderKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => applyKind(kind)}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  draft.kind === kind
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-border text-muted hover:text-fg'
                }`}
              >
                {KIND_LABEL[kind]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">
              Label
              <input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="e.g. Claude"
                className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg"
              />
            </label>
            <div className="text-xs text-muted">
              <div className="flex items-center justify-between">
                <span>Default model</span>
                <button
                  type="button"
                  onClick={loadModels}
                  disabled={(!draft.apiKey.trim() && !editingId) || loadingModels}
                  className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadingModels ? <Loader2 size={11} className="animate-spin" /> : null}
                  Load models
                </button>
              </div>
              <input
                value={draft.defaultModel}
                onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
                placeholder="model id"
                className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-fg"
              />
              {models.length > 0 && (
                <select
                  value={models.some((m) => m.id === draft.defaultModel) ? draft.defaultModel : ''}
                  onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg"
                >
                  <option value="">Select from {models.length} models…</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName ? `${model.displayName} · ${model.id}` : model.id}
                    </option>
                  ))}
                </select>
              )}
              {modelsError && <p className="mt-1 text-danger">{modelsError}</p>}
            </div>
          </div>
          <label className="block text-xs text-muted">
            {draft.kind === 'anthropic' ? 'Gateway URL (optional)' : 'Base URL'}
            <input
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder={
                draft.kind === 'anthropic'
                  ? 'Leave blank for api.anthropic.com, or your gateway (e.g. Aerolink)'
                  : 'https://api.openai.com/v1 · https://api.deepseek.com · http://localhost:11434/v1'
              }
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-fg"
            />
            {draft.kind === 'anthropic' && (
              <span className="mt-1 block normal-case text-muted">
                Point Claude at a gateway that fronts the Anthropic Messages API. The API key below is
                sent as <code className="text-fg">x-api-key</code>; add a custom header if your gateway
                needs bearer auth.
              </span>
            )}
          </label>
          <label className="block text-xs text-muted">
            API key{editingId ? ' (leave blank to keep current)' : ''}
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder={
                editingId
                  ? 'Leave blank to keep the stored key'
                  : 'Stored encrypted on this device'
              }
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-fg"
            />
          </label>

          <div className="text-xs text-muted">
            <div className="flex items-center justify-between">
              <span>Custom headers (optional)</span>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, headers: [...draft.headers, { key: '', value: '' }] })}
                className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted hover:text-fg"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            {draft.headers.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {draft.headers.map((header, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <input
                      value={header.key}
                      onChange={(e) => {
                        const headers = draft.headers.slice();
                        headers[index] = { ...headers[index], key: e.target.value };
                        setDraft({ ...draft, headers });
                      }}
                      placeholder="Header"
                      className="w-2/5 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-fg"
                    />
                    <input
                      value={header.value}
                      onChange={(e) => {
                        const headers = draft.headers.slice();
                        headers[index] = { ...headers[index], value: e.target.value };
                        setDraft({ ...draft, headers });
                      }}
                      placeholder="Value"
                      className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-fg"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, headers: draft.headers.filter((_, i) => i !== index) })
                      }
                      aria-label="Remove header"
                      className="rounded p-1 text-muted hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg disabled:opacity-50"
            >
              {editingId ? 'Save changes' : 'Save provider'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setDraft(EMPTY_DRAFT);
            resetModels();
            setAdding(true);
          }}
          className="mt-4 flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          <Plus size={15} />
          Add provider
        </button>
      )}
    </section>
  );
}
