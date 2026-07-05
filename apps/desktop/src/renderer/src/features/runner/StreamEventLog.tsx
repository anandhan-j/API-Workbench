import { ArrowDown, ArrowUp, Info, TriangleAlert } from 'lucide-react';
import type { StreamEvent } from '@shared/protocol';
import { cn } from '../../lib/cn';

const DIRECTION_META: Record<
  StreamEvent['direction'],
  { icon: typeof Info; color: string; label: string }
> = {
  sent: { icon: ArrowUp, color: 'text-accent', label: 'Sent' },
  received: { icon: ArrowDown, color: 'text-success', label: 'Recv' },
  info: { icon: Info, color: 'text-muted', label: 'Info' },
  error: { icon: TriangleAlert, color: 'text-danger', label: 'Error' },
};

function timeOf(at: number): string {
  try {
    return new Date(at).toLocaleTimeString();
  } catch {
    return '';
  }
}

/**
 * A directional timeline of a WebSocket/SSE session's frames — sent, received,
 * info, and error events with timestamps. Used in both the runner response
 * viewer and the workflow run panel.
 */
export function StreamEventLog({ events }: { events: StreamEvent[] }): JSX.Element {
  if (events.length === 0) {
    return <p className="p-3 text-xs text-muted">No events.</p>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {events.map((event, i) => {
        const meta = DIRECTION_META[event.direction];
        const Icon = meta.icon;
        return (
          <li key={i} className="flex items-start gap-2 px-3 py-1.5 text-xs">
            <Icon size={13} className={cn('mt-0.5 shrink-0', meta.color)} />
            <span className="w-16 shrink-0 text-muted">{timeOf(event.at)}</span>
            {event.kind && event.kind !== 'message' && (
              <span className="shrink-0 rounded bg-surface-2 px-1 text-[10px] text-muted">
                {event.kind}
              </span>
            )}
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono">{event.data}</pre>
          </li>
        );
      })}
    </ul>
  );
}
