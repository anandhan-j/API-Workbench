import { useDispatchStore } from '../stores/dispatch-store';

/**
 * Full-page dispatch view. Surfaces counts per level; the live stream itself is
 * always available in the docked monitor panel.
 */
export function DispatchPage(): JSX.Element {
  const events = useDispatchStore((s) => s.events);

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.level] = (acc[e.level] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="w-full p-8">
      <h1 className="text-2xl font-semibold">Dispatch Monitor</h1>
      <p className="mt-2 text-muted">
        Unified stream of main-process log and dispatch events. {events.length} events buffered.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['debug', 'info', 'warn', 'error'] as const).map((level) => (
          <div key={level} className="rounded-lg border border-border bg-surface p-4">
            <div className="text-2xl font-semibold">{counts[level] ?? 0}</div>
            <div className="text-xs uppercase tracking-wide text-muted">{level}</div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted">
        The live event table is shown in the docked panel at the bottom of the window. Toggle it
        from the status bar or in Settings.
      </p>
    </div>
  );
}
