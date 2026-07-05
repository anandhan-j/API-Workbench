// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { StreamProtocolExtras } from '@shared/protocol';
import { ExecutionService } from '../execution-service';
import { createWebSocketProvider } from '../providers/websocket-provider';
import type { WsCloseInfo, WsConnection, WsConnectOptions, WsConnector } from '../streams/ws-port';
import { RequestTypeRegistry } from '../../plugins/registries/request-type-registry';
import { FetchTransport } from '../node-transport';

/** A scripted fake WS connection the test drives manually. */
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
  onOpen(handler: () => void): void {
    this.openHandler = handler;
  }
  onMessage(handler: (data: string) => void): void {
    this.messageHandler = handler;
  }
  onClose(handler: (info: WsCloseInfo) => void): void {
    this.closeHandler = handler;
  }
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }
  emitOpen(): void {
    this.openHandler?.();
  }
  emitMessage(data: string): void {
    this.messageHandler?.(data);
  }
  emitClose(code: number, reason = ''): void {
    this.closeHandler?.({ code, reason });
  }
  emitError(message: string): void {
    this.errorHandler?.(new Error(message));
  }
}

function fakeConnector(): WsConnector & { last?: FakeConnection; lastOptions?: WsConnectOptions; lastUrl?: string } {
  const connector: WsConnector & { last?: FakeConnection; lastOptions?: WsConnectOptions; lastUrl?: string } = {
    connect(url, options) {
      const connection = new FakeConnection();
      connector.last = connection;
      connector.lastOptions = options;
      connector.lastUrl = url;
      return connection;
    },
  };
  return connector;
}

const vars: Record<string, string> = { host: 'echo.test', token: 'secret' };
const evaluate = (tpl: string): string => tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');

function service(connector: WsConnector): ExecutionService {
  return new ExecutionService(new FetchTransport(() => true), {
    evaluate,
    requestTypes: new RequestTypeRegistry([createWebSocketProvider(connector)]),
  });
}

function envelope(payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type: 'websocket', payload: { url: 'ws://echo.test', ...payload }, ...extra };
}

describe('createWebSocketProvider (collect mode)', () => {
  it('sends scripted messages, collects received frames, and closes', async () => {
    const connector = fakeConnector();
    const promise = service(connector).run(
      envelope({ url: 'ws://{{host}}', messages: [{ data: 'ping', delayMs: 0 }] }),
    );
    // Let the connector.connect run and handlers register.
    await Promise.resolve();
    const conn = connector.last!;
    expect(connector.lastUrl).toBe('ws://echo.test');
    conn.emitOpen();
    await new Promise((r) => setTimeout(r, 5)); // let the delay:0 send fire
    expect(conn.sent).toEqual(['ping']);
    conn.emitMessage('pong');
    conn.emitClose(1000);
    const response = await promise;
    expect(response.ok).toBe(true);
    expect(response.type).toBe('websocket');
    expect(JSON.parse(response.body)).toEqual(['pong']);
    const extras = StreamProtocolExtras.parse(response.protocol);
    expect(extras.closeCode).toBe(1000);
    expect(extras.events.map((e) => e.direction)).toEqual(['info', 'sent', 'received']);
  });

  it('truncates at maxEvents', async () => {
    const connector = fakeConnector();
    const promise = service(connector).run(envelope({ collect: { maxEvents: 2, durationMs: 10_000 } }));
    await Promise.resolve();
    const conn = connector.last!;
    conn.emitOpen();
    conn.emitMessage('a');
    conn.emitMessage('b'); // hits maxEvents=2
    const response = await promise;
    const extras = StreamProtocolExtras.parse(response.protocol);
    expect(extras.truncated).toBe(true);
    expect(JSON.parse(response.body)).toEqual(['a', 'b']);
    expect(conn.closed).toBe(true);
  });

  it('stops at durationMs when the server never closes', async () => {
    const connector = fakeConnector();
    const promise = service(connector).run(envelope({ collect: { maxEvents: 50, durationMs: 20 } }));
    await Promise.resolve();
    const conn = connector.last!;
    conn.emitOpen();
    conn.emitMessage('x');
    const response = await promise;
    expect(response.ok).toBe(true);
    expect(StreamProtocolExtras.parse(response.protocol).truncated).toBe(true);
  });

  it('reports ok:false when the socket never opened before the duration cap', async () => {
    const connector = fakeConnector();
    const promise = service(connector).run(envelope({ collect: { maxEvents: 50, durationMs: 20 } }));
    await Promise.resolve();
    // Never call emitOpen — the upgrade stalls until durationMs elapses.
    const response = await promise;
    expect(response.ok).toBe(false);
  });

  it('parses JSON message data into the body array', async () => {
    const connector = fakeConnector();
    const promise = service(connector).run(envelope({}));
    await Promise.resolve();
    const conn = connector.last!;
    conn.emitOpen();
    conn.emitMessage('{"n":1}');
    conn.emitClose(1000);
    const response = await promise;
    expect(JSON.parse(response.body)).toEqual([{ n: 1 }]);
  });

  it('reports a connection error as a failed response', async () => {
    const connector = fakeConnector();
    const promise = service(connector).run(envelope({}));
    await Promise.resolve();
    connector.last!.emitError('handshake refused');
    const response = await promise;
    expect(response.ok).toBe(false);
    expect(response.error).toBe('handshake refused');
  });

  it('puts auth headers on the handshake', async () => {
    const connector = fakeConnector();
    const promise = service(connector).run(
      envelope({}, { auth: { type: 'bearer', token: '{{token}}' } }),
    );
    await Promise.resolve();
    expect(connector.lastOptions?.headers.Authorization).toBe('Bearer secret');
    connector.last!.emitOpen();
    connector.last!.emitClose(1000);
    await promise;
  });
});
