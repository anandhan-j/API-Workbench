import { useMemo } from 'react';
import { Pause, Play, Trash2, X } from 'lucide-react';
import type { LogLevel } from '@shared/ipc-contract';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui-store';
import { selectFilteredEvents, useDispatchStore } from '../../stores/dispatch-store';

const LEVELS: Array<LogLevel | 'all'> = ['all', 'debug', 'info', 'warn', 'error'];

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'text-muted',
  info: 'text-accent',
  warn: 'text-warning',
  error: 'text-danger',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false }) + '.' + String(ts % 1000).padStart(3, '0');
}

/**
 * Live dispatch monitor panel. Renders the unified stream of main-process log /
 * dispatch events with level filtering, pause, and clear. This is the in-app
 * observability surface for "dispatch monitoring".
 */
export function DispatchMonitor(): JSX.Element {
  const levelFilter = useDispatchStore((s) => s.levelFilter);
  const paused = useDispatchStore((s) => s.paused);
  const setLevelFilter = useDispatchStore((s) => s.setLevelFilter);
  const togglePaused = useDispatchStore((s) => s.togglePaused);
  const clear = useDispatchStore((s) => s.clear);
  const events = useDispatchStore(selectFilteredEvents);
  const toggleMonitor = useUiStore((s) => s.toggleMonitor);

  const rows = useMemo(() => events.slice().reverse(), [events]);

  return (
    <section
      aria-label="Dispatch monitor"
      className="flex h-56 flex-col border-t border-border bg-surface"
    >
      <header className="flex h-9 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Dispatch Monitor
          </span>
          <div className="flex items-center gap-1">
            {LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setLevelFilter(level)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px] capitalize',
                  levelFilter === level
                    ? 'bg-accent text-accent-fg'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePaused}
            aria-label={paused ? 'Resume stream' : 'Pause stream'}
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button
            type="button"
            onClick={clear}
            aria-label="Clear events"
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={toggleMonitor}
            aria-label="Close dispatch monitor"
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto font-mono text-xs">
        {rows.length === 0 ? (
          <p className="p-3 text-muted">No events yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((event) => (
                <tr key={event.id} className="border-b border-border/50 align-top">
                  <td className="whitespace-nowrap px-3 py-1 text-muted">
                    {formatTime(event.timestamp)}
                  </td>
                  <td className={cn('px-2 py-1 uppercase', LEVEL_STYLES[event.level])}>
                    {event.level}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-muted">{event.source}</td>
                  <td className="px-2 py-1 text-fg">{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
