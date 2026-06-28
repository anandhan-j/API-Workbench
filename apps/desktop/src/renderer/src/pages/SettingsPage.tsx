import type { ThemeMode } from '../stores/ui-store';
import { useUiStore } from '../stores/ui-store';

const THEMES: ThemeMode[] = ['light', 'dark'];

export function SettingsPage(): JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const monitorOpen = useUiStore((s) => s.monitorOpen);
  const toggleMonitor = useUiStore((s) => s.toggleMonitor);

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
