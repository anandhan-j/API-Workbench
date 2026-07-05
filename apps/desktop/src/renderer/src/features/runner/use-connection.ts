import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionState, RequestEnvelope, StreamEvent } from '@shared/protocol';
import { invoke, onConnectionEvent, onConnectionState } from '../../lib/ipc';

export type SessionState = ConnectionState | 'idle';

export interface UseConnection {
  state: SessionState;
  events: StreamEvent[];
  error: string | null;
  open: (envelope: RequestEnvelope) => void;
  send: (data: string) => void;
  close: () => void;
}

/**
 * Drives one interactive WebSocket/SSE session (Phase 7). Opens a session by a
 * client-generated id, streams live frames and lifecycle changes from the main
 * process, and tears the session down on unmount.
 */
export function useConnection(): UseConnection {
  const [state, setState] = useState<SessionState>('idle');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    const offEvent = onConnectionEvent(({ sessionId, event }) => {
      if (sessionId !== sessionRef.current) return;
      setEvents((prev) => [...prev, event]);
    });
    const offState = onConnectionState(({ sessionId, state: next, error: err }) => {
      if (sessionId !== sessionRef.current) return;
      setState(next);
      if (err) setError(err);
    });
    return () => {
      offEvent();
      offState();
      // Close any live session when the editor unmounts.
      if (sessionRef.current) void invoke('connection.close', { sessionId: sessionRef.current });
    };
  }, []);

  const open = useCallback((envelope: RequestEnvelope) => {
    const sessionId = crypto.randomUUID();
    sessionRef.current = sessionId;
    setEvents([]);
    setError(null);
    setState('connecting');
    void invoke('connection.open', { sessionId, request: envelope }).catch((err: unknown) => {
      setState('error');
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  const send = useCallback((data: string) => {
    if (!sessionRef.current) return;
    void invoke('connection.send', { sessionId: sessionRef.current, data }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  const close = useCallback(() => {
    if (!sessionRef.current) return;
    void invoke('connection.close', { sessionId: sessionRef.current });
    sessionRef.current = null;
    setState('closed');
  }, []);

  return { state, events, error, open, send, close };
}
