// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ConnectionEvent, ConnectionStateEvent } from '@shared/protocol';
import { ConnectionSessionManager } from '../streams/connection-sessions';
import type { WsCloseInfo, WsConnection, WsConnectOptions, WsConnector } from '../streams/ws-port';
import type { SseStreamer } from '../streams/sse-port';

class FakeConnection implements WsConnection {
  private openHandler?: () => void;
  private messageHandler?: (data: string) => void;
  private closeHandler?: (info: WsCloseInfo) => void;
  private errorHandler?: (error: Error) => void;
  sent: string[] = [];
  closed = false;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  onOpen(h: () => void): void {
    this.openHandler = h;
  }
  onMessage(h: (data: string) => void): void {
    this.messageHandler = h;
  }
  onClose(h: (info: WsCloseInfo) => void): void {
    this.closeHandler = h;
  }
  onError(h: (error: Error) => void): void {
    this.errorHandler = h;
  }
  emitOpen(): void {
    this.openHandler?.();
  }
  emitMessage(data: string): void {
    this.messageHandler?.(data);
  }
  emitClose(code: number): void {
    this.closeHandler?.({ code, reason: '' });
  }
  emitError(msg: string): void {
    this.errorHandler?.(new Error(msg));
  }
}

function harness() {
  let connection: FakeConnection | undefined;
  let lastOptions: WsConnectOptions | undefined;
  const wsConnector: WsConnector = {
    connect(_url, options) {
      connection = new FakeConnection();
      lastOptions = options;
      return connection;
    },
  };
  const sseStreamer: SseStreamer = {
    async open() {
      return { status: 200, headers: {}, chunks: (async function* () {})() };
    },
  };
  const events: ConnectionEvent[] = [];
  const states: ConnectionStateEvent[] = [];
  const manager = new ConnectionSessionManager({
    wsConnector,
    sseStreamer,
    evaluate: (t) => t.replace('{{token}}', 'secret'),
    resolveArtifacts: async () => ({ headers: { Authorization: 'Bearer secret' }, query: {}, cookies: {} }),
    emitEvent: (p) => events.push(p),
    emitState: (p) => states.push(p),
  });
  return { manager, events, states, getConnection: () => connection, getOptions: () => lastOptions };
}

function wsEnvelope(payload: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return { type: 'websocket', payload: { url: 'ws://echo.test', ...payload }, ...extra };
}

describe('ConnectionSessionManager', () => {
  it('opens, streams received frames, and reports lifecycle', async () => {
    const h = harness();
    await h.manager.open('s1', wsEnvelope());
    h.getConnection()!.emitOpen();
    h.getConnection()!.emitMessage('hello');
    expect(h.states.map((s) => s.state)).toEqual(['connecting', 'open']);
    expect(h.events.filter((e) => e.event.direction === 'received').map((e) => e.event.data)).toEqual([
      'hello',
    ]);
  });

  it('sends on an open session and records a sent event', async () => {
    const h = harness();
    await h.manager.open('s1', wsEnvelope());
    h.getConnection()!.emitOpen();
    h.manager.send('s1', 'ping');
    expect(h.getConnection()!.sent).toEqual(['ping']);
    expect(h.events.some((e) => e.event.direction === 'sent' && e.event.data === 'ping')).toBe(true);
  });

  it('rejects a second open for the same session id', async () => {
    const h = harness();
    await h.manager.open('s1', wsEnvelope());
    await expect(h.manager.open('s1', wsEnvelope())).rejects.toThrow(/already open/);
  });

  it('applies auth artifacts to the handshake headers', async () => {
    const h = harness();
    await h.manager.open('s1', wsEnvelope({}, { auth: { type: 'bearer', token: '{{token}}' } }));
    expect(h.getOptions()!.headers.Authorization).toBe('Bearer secret');
  });

  it('reports a server close as a closed state with the code', async () => {
    const h = harness();
    await h.manager.open('s1', wsEnvelope());
    h.getConnection()!.emitOpen();
    h.getConnection()!.emitClose(1000);
    expect(h.states.at(-1)).toMatchObject({ state: 'closed', code: 1000 });
  });

  it('reports a connection error as an error state', async () => {
    const h = harness();
    await h.manager.open('s1', wsEnvelope());
    h.getConnection()!.emitError('refused');
    expect(h.states.at(-1)).toMatchObject({ state: 'error', error: 'refused' });
  });

  it('closeAll tears down live sessions', async () => {
    const h = harness();
    await h.manager.open('s1', wsEnvelope());
    h.getConnection()!.emitOpen();
    h.manager.closeAll();
    expect(h.getConnection()!.closed).toBe(true);
    expect(h.states.at(-1)).toMatchObject({ sessionId: 's1', state: 'closed' });
  });

  it('throws when sending to a closed session', async () => {
    const h = harness();
    await h.manager.open('s1', wsEnvelope());
    h.manager.close('s1');
    expect(() => h.manager.send('s1', 'x')).toThrow(/not open/);
  });

  it('does not support interactive HTTP', async () => {
    const h = harness();
    await h.manager.open('s1', { type: 'http', payload: { method: 'GET', url: 'http://x' } });
    expect(h.states.at(-1)?.state).toBe('error');
  });
});
