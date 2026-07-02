import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { PREF_VERIFY_SSL } from '@shared/persistence';
import type { ThemeMode } from '../stores/ui-store';
import { FONT_SCALE_MAX, FONT_SCALE_MIN, useUiStore } from '../stores/ui-store';
import { invoke, isBridgeAvailable } from '../lib/ipc';

const THEMES: ThemeMode[] = ['light', 'dark'];

export function SettingsPage(): JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const monitorOpen = useUiStore((s) => s.monitorOpen);
  const toggleMonitor = useUiStore((s) => s.toggleMonitor);
  const fontScale = useUiStore((s) => s.fontScale);
  const increaseFontScale = useUiStore((s) => s.increaseFontScale);
  const decreaseFontScale = useUiStore((s) => s.decreaseFontScale);
  const resetFontScale = useUiStore((s) => s.resetFontScale);

  const [logPath, setLogPath] = useState<string | null>(null);
  useEffect(() => {
    if (!isBridgeAvailable()) return;
    void invoke('log.getPath', {})
      .then((r) => setLogPath(r.path))
      .catch(() => undefined);
  }, []);

  // Verify-TLS preference (default on). Persisted in the main process so both
  // the request runner and workflow requests honour it.
  const [verifySsl, setVerifySsl] = useState(true);
  useEffect(() => {
    if (!isBridgeAvailable()) return;
    void invoke('preferences.get', { key: PREF_VERIFY_SSL })
      .then((r) => setVerifySsl(r.value !== false))
      .catch(() => undefined);
  }, []);

  const toggleVerifySsl = (next: boolean): void => {
    setVerifySsl(next);
    void invoke('preferences.set', { key: PREF_VERIFY_SSL, value: next }).catch(() => {
      // Revert the optimistic toggle if the write fails.
      setVerifySsl(!next);
    });
  };

  return (
    <div className="w-full p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <h2 className="mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Appearance
      </h2>

      <section className="mt-3 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Theme</h3>
        <p className="mt-1 text-sm text-muted">Choose the application theme.</p>
        <div className="mt-3 flex gap-2">
          {THEMES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              className={`rounded-md border px-4 py-2 text-sm capitalize ${
                theme === mode
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-border text-muted hover:text-fg'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Font size</h3>
        <p className="mt-1 text-sm text-muted">Adjust the interface text size.</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={decreaseFontScale}
            disabled={fontScale <= FONT_SCALE_MIN}
            aria-label="Decrease font size"
            title="Smaller"
            className="flex h-9 w-10 items-center justify-center gap-0.5 rounded-md border border-border hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-xs font-semibold">A</span>
            <span className="text-sm">&minus;</span>
          </button>
          <button
            type="button"
            onClick={increaseFontScale}
            disabled={fontScale >= FONT_SCALE_MAX}
            aria-label="Increase font size"
            title="Larger"
            className="flex h-9 w-10 items-center justify-center gap-0.5 rounded-md border border-border hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-base font-semibold">A</span>
            <span className="text-sm">+</span>
          </button>
          <span
            className="min-w-[3.5rem] text-center text-sm tabular-nums text-muted"
            aria-live="polite"
          >
            {Math.round(fontScale * 100)}%
          </span>
          <button
            type="button"
            onClick={resetFontScale}
            disabled={fontScale === 1}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </section>

      <h2 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        General
      </h2>

      <section className="mt-3 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Dispatch monitor</h3>
        <p className="mt-1 text-sm text-muted">
          Show the live event/log panel at the bottom of the window.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={monitorOpen} onChange={toggleMonitor} />
          Show dispatch monitor
        </label>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Network security</h3>
        <p className="mt-1 text-sm text-muted">
          Validate TLS/SSL certificates when sending requests. Applies to the request runner and
          workflow requests.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={verifySsl}
            onChange={(e) => toggleVerifySsl(e.target.checked)}
          />
          Verify SSL certificates
        </label>
        {!verifySsl && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              Certificate verification is off. Requests will accept self-signed or invalid
              certificates, which exposes them to man-in-the-middle attacks. Only use this on trusted
              networks.
            </span>
          </p>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Diagnostics</h3>
        <p className="mt-1 text-sm text-muted">
          Errors from the app are written to a rotating log file. Share it when reporting a problem.
        </p>
        {logPath ? (
          <>
            <p className="mt-3 break-all rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-muted">
              {logPath}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void invoke('log.reveal', {}).catch(() => undefined)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Reveal in file manager
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(logPath).catch(() => undefined)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Copy path
              </button>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            The log file is available when running inside the desktop app.
          </p>
        )}
      </section>
    </div>
  );
}
