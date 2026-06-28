import { useQuery } from '@tanstack/react-query';
import { Activity, Circle, Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/cn';
import { invoke, isBridgeAvailable } from '../../lib/ipc';
import { useUiStore } from '../../stores/ui-store';
import { useDispatchStore } from '../../stores/dispatch-store';

/**
 * Bottom status bar. Shows app/runtime info, a live dispatch-activity indicator
 * (the count of recent events and a pulse on the latest), the bridge connection
 * state, and a quick theme toggle.
 */
export function StatusBar(): JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleMonitor = useUiStore((s) => s.toggleMonitor);
  const eventCount = useDispatchStore((s) => s.events.length);
  const lastEvent = useDispatchStore((s) => s.events[s.events.length - 1]);

  const { data: info } = useQuery({
    queryKey: ['app.getInfo'],
    queryFn: () => invoke('app.getInfo', {}),
    enabled: isBridgeAvailable(),
  });

  const connected = isBridgeAvailable();

  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-surface px-3 text-xs text-muted">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <Circle
            size={9}
            className={connected ? 'fill-success text-success' : 'fill-danger text-danger'}
          />
          {connected ? 'Connected' : 'Offline (no Electron bridge)'}
        </span>
        {info && (
          <span className="font-mono">
            v{info.version} · Electron {info.electron} · {info.platform}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleMonitor}
          className="flex items-center gap-1.5 hover:text-fg"
          aria-label="Toggle dispatch monitor"
        >
          <Activity size={13} className={cn(lastEvent && 'text-accent')} />
          <span className="font-mono">{eventCount} events</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-1.5 hover:text-fg"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
          <span className="capitalize">{theme}</span>
        </button>
      </div>
    </footer>
  );
}
