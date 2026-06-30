import type { ThemeMode } from '../stores/ui-store';
import { FONT_SCALE_MAX, FONT_SCALE_MIN, useUiStore } from '../stores/ui-store';

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

  return (
    <div className="w-full p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Appearance</h2>
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
        <h2 className="text-sm font-semibold">Font size</h2>
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

      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Dispatch monitor</h2>
        <p className="mt-1 text-sm text-muted">
          Show the live event/log panel at the bottom of the window.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={monitorOpen} onChange={toggleMonitor} />
          Show dispatch monitor
        </label>
      </section>
    </div>
  );
}
