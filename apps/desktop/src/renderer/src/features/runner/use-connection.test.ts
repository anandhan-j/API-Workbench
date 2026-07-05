import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ConnectionEvent, ConnectionStateEvent } from '@shared/protocol';

let eventListener: ((e: ConnectionEvent) => void) | null = null;
let stateListener: ((e: ConnectionStateEvent) => void) | null = null;
const invoke = vi.fn((..._args: unknown[]): Promise<unknown> => Promise.resolve({}));

vi.mock('../../lib/ipc', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  onConnectionEvent: (fn: (e: ConnectionEvent) => void) => {
    eventListener = fn;
    return () => {
      eventListener = null;
    };
  },
  onConnectionState: (fn: (e: ConnectionStateEvent) => void) => {
    stateListener = fn;
    return () => {
      stateListener = null;
    };
  },
}));

// Imported after the mock is registered.
const { useConnection } = await import('./use-connection');

function envelope() {
  return { type: 'websocket' as const, payload: { url: 'ws://x' } };
}

/** The sessionId the hook generated on its last connection.open invoke. */
function currentSession(): string {
  const call = [...invoke.mock.calls].reverse().find((c) => c[0] === 'connection.open');
  return (call?.[1] as { sessionId: string } | undefined)?.sessionId ?? '';
}

describe('useConnection', () => {
  beforeEach(() => {
    invoke.mockClear();
    eventListener = null;
    stateListener = null;
  });
  afterEach(() => vi.clearAllMocks());

  it('opens a session and moves to connecting', () => {
    const { result } = renderHook(() => useConnection());
    act(() => result.current.open(envelope()));
    expect(invoke).toHaveBeenCalledWith('connection.open', expect.objectContaining({ request: envelope() }));
    expect(result.current.state).toBe('connecting');
  });

  it('accumulates events and applies state only for the active session', () => {
    const { result } = renderHook(() => useConnection());
    act(() => result.current.open(envelope()));
    const sessionId = currentSession();

    act(() => stateListener?.({ sessionId, state: 'open' }));
    expect(result.current.state).toBe('open');

    act(() => eventListener?.({ sessionId, event: { at: 1, direction: 'received', kind: 'text', data: 'hi' } }));
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].data).toBe('hi');

    // Events for a different session are ignored.
    act(() => eventListener?.({ sessionId: 'other', event: { at: 2, direction: 'received', kind: 'text', data: 'nope' } }));
    expect(result.current.events).toHaveLength(1);
  });

  it('sends on the open session', () => {
    const { result } = renderHook(() => useConnection());
    act(() => result.current.open(envelope()));
    const sessionId = currentSession();
    act(() => stateListener?.({ sessionId, state: 'open' }));
    act(() => result.current.send('ping'));
    expect(invoke).toHaveBeenCalledWith('connection.send', { sessionId, data: 'ping' });
  });

  it('surfaces an error state with its message', () => {
    const { result } = renderHook(() => useConnection());
    act(() => result.current.open(envelope()));
    const sessionId = currentSession();
    act(() => stateListener?.({ sessionId, state: 'error', error: 'refused' }));
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('refused');
  });

  it('closes the session and stops applying its events', () => {
    const { result } = renderHook(() => useConnection());
    act(() => result.current.open(envelope()));
    const sessionId = currentSession();
    act(() => result.current.close());
    expect(invoke).toHaveBeenCalledWith('connection.close', { sessionId });
    expect(result.current.state).toBe('closed');
    // After close the ref is cleared, so late events are dropped.
    act(() => eventListener?.({ sessionId, event: { at: 3, direction: 'received', kind: 'text', data: 'late' } }));
    expect(result.current.events).toHaveLength(0);
  });

  it('resets events between connections', () => {
    const { result } = renderHook(() => useConnection());
    act(() => result.current.open(envelope()));
    const first = currentSession();
    act(() => eventListener?.({ sessionId: first, event: { at: 1, direction: 'received', kind: 'text', data: 'a' } }));
    expect(result.current.events).toHaveLength(1);
    act(() => result.current.open(envelope()));
    expect(result.current.events).toHaveLength(0);
  });
});
