// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ConnectionEvent, ConnectionStateEvent } from '@shared/protocol';
import { ConnectionSessionManager, type PluginConnectionPort } from '../streams/connection-sessions';
import type { WsCloseInfo, WsConnection, WsConnectOptions, WsConnector } from '../streams/ws-port';
import type { SseStreamer } from '../streams/sse-port';
import { RequestTypeRegistry } from '../../plugins/registries/request-type-registry';
import { deepSubstitute } from '@shared/substitute';

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

/** A fake plugin-host connection port that records calls and can push events. */
class FakePluginPort implements PluginConnectionPort {
  opened: Array<{ sessionId: string; pluginId: string; type: string; payload: Record<string, unknown> }> = [];
  sent: Array<{ sessionId: string; pluginId: string; data: string }> = [];
  closed: Array<{ sessionId: string; pluginId: string }> = [];
  private eventHandlers: Array<(p: ConnectionEvent) => void> = [];
  private stateHandlers: Array<(p: ConnectionStateEvent) => void> = [];
  async openConnection(req: { sessionId: string; pluginId: string; type: string; payload: Record<string, unknown> }): Promise<void> {
    this.opened.push(req);
  }
  async sendConnection(req: { sessionId: string; pluginId: string; data: string }): Promise<void> {
    this.sent.push(req);
  }
  async closeConnection(req: { sessionId: string; pluginId: string }): Promise<void> {
    this.closed.push(req);
  }
  onConnectionEvent(h: (p: ConnectionEvent) => void): () => void {
    this.eventHandlers.push(h);
    return () => undefined;
  }
  onConnectionState(h: (p: ConnectionStateEvent) => void): () => void {
    this.stateHandlers.push(h);
    return () => undefined;
  }
  pushEvent(p: ConnectionEvent): void {
    this.eventHandlers.forEach((h) => h(p));
  }
  pushState(p: ConnectionStateEvent): void {
    this.stateHandlers.forEach((h) => h(p));
  }
}

function pluginHarness() {
  const port = new FakePluginPort();
  // A plugin request type registered as plugin:demo/chat.
  const registry = new RequestTypeRegistry([]);
  registry.registerPlugin('demo', {
    type: 'chat',
    payloadSchema: z.object({ room: z.string() }),
    resolveVariables: (payload, evaluate) => deepSubstitute(payload, evaluate),
    buildApplyContext: () => ({ url: 'chat://demo' }),
    summarize: () => ({ badge: 'CHAT', target: 'demo' }),
    execute: () => Promise.reject(new Error('use openConnection')),
  });
  const events: ConnectionEvent[] = [];
  const states: ConnectionStateEvent[] = [];
  const manager = new ConnectionSessionManager({
    wsConnector: { connect: () => { throw new Error('unused'); } },
    sseStreamer: { open: () => Promise.reject(new Error('unused')) },
    evaluate: (t) => t.replace('{{room}}', 'general'),
    resolveArtifacts: async () => ({ headers: { Authorization: 'Bearer x' }, query: {}, cookies: {} }),
    requestTypes: registry,
    pluginConnections: port,
    emitEvent: (p) => events.push(p),
    emitState: (p) => states.push(p),
  });
  return { manager, port, events, states };
}

describe('ConnectionSessionManager (plugin sessions, Phase 7)', () => {
  it('opens a plugin session with resolved payload and auth artifacts', async () => {
    const h = pluginHarness();
    await h.manager.open('p1', {
      type: 'plugin:demo/chat',
      payload: { room: '{{room}}' },
      auth: { type: 'bearer', token: 't' },
    });
    expect(h.port.opened).toHaveLength(1);
    expect(h.port.opened[0]).toMatchObject({ sessionId: 'p1', pluginId: 'demo', type: 'chat', payload: { room: 'general' } });
    expect(h.states.map((s) => s.state)).toContain('connecting');
  });

  it('forwards host-pushed frames and state for a plugin session', async () => {
    const h = pluginHarness();
    await h.manager.open('p1', { type: 'plugin:demo/chat', payload: { room: 'x' } });
    h.port.pushState({ sessionId: 'p1', state: 'open' });
    h.port.pushEvent({ sessionId: 'p1', event: { at: 1, direction: 'received', kind: 'text', data: 'hi' } });
    expect(h.states.some((s) => s.state === 'open')).toBe(true);
    expect(h.events.some((e) => e.event.data === 'hi')).toBe(true);
  });

  it('routes send and close to the plugin port', async () => {
    const h = pluginHarness();
    await h.manager.open('p1', { type: 'plugin:demo/chat', payload: { room: 'x' } });
    h.manager.send('p1', 'ping');
    expect(h.port.sent).toEqual([{ sessionId: 'p1', pluginId: 'demo', data: 'ping' }]);
    // send also records a local 'sent' frame for the UI.
    expect(h.events.some((e) => e.event.direction === 'sent' && e.event.data === 'ping')).toBe(true);
    h.manager.close('p1');
    expect(h.port.closed).toEqual([{ sessionId: 'p1', pluginId: 'demo' }]);
  });

  it('cleans up when the host reports the plugin session closed', async () => {
    const h = pluginHarness();
    await h.manager.open('p1', { type: 'plugin:demo/chat', payload: { room: 'x' } });
    h.port.pushState({ sessionId: 'p1', state: 'closed', code: 1000 });
    // The session is gone, so a later send throws.
    expect(() => h.manager.send('p1', 'x')).toThrow(/not open/);
  });
});
