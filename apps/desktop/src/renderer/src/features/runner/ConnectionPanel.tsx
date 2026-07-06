import { useState } from 'react';
import { Plug, PlugZap, Send } from 'lucide-react';
import type { RequestEnvelope, SsePayload, WebSocketPayload } from '@shared/protocol';
import { WEBSOCKET_REQUEST_TYPE } from '@shared/protocol';
import { cn } from '../../lib/cn';
import { StreamEventLog } from './StreamEventLog';
import { useConnection, type SessionState } from './use-connection';

const STATE_STYLE: Record<SessionState, string> = {
  idle: 'bg-surface-2 text-muted',
  connecting: 'bg-warning/20 text-warning',
  open: 'bg-success/20 text-success',
  closed: 'bg-surface-2 text-muted',
  error: 'bg-danger/20 text-danger',
};

/**
 * Interactive session panel for WebSocket/SSE (Phase 7): connect, watch the
 * live event stream, and (for WebSocket) send messages on the open connection.
 */
export function ConnectionPanel({ envelope }: { envelope: RequestEnvelope }): JSX.Element {
  const { state, events, error, open, send, close } = useConnection();
  const [message, setMessage] = useState('');
  // WebSocket and plugin protocols are bidirectional; SSE is receive-only.
  const canSend = envelope.type === WEBSOCKET_REQUEST_TYPE || envelope.type.startsWith('plugin:');
  const connected = state === 'open';
  const target =
    (envelope.payload as Partial<WebSocketPayload & SsePayload> | undefined)?.url ?? '';

  const submit = (): void => {
    if (!message.trim()) return;
    send(message);
    setMessage('');
  };

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className={cn('rounded px-2 py-0.5 text-xs font-semibold capitalize', STATE_STYLE[state])}>
          {state}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{target}</span>
        {connected || state === 'connecting' ? (
          <button
            type="button"
            onClick={close}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <Plug size={14} /> Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => open(envelope)}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg"
          >
            <PlugZap size={14} /> Connect
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <StreamEventLog events={events} />
      </div>

      {canSend && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex gap-2"
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!connected}
            placeholder={connected ? 'Message to send…' : 'Connect to send messages'}
            aria-label="WebSocket message"
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || !message.trim()}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            <Send size={14} /> Send
          </button>
        </form>
      )}
    </div>
  );
}
