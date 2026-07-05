import type { ApplyContext, AuthArtifacts } from '@shared/auth';
import type { VariableContext } from '@shared/execution';
import {
  RequestEnvelope,
  SSE_REQUEST_TYPE,
  SsePayload,
  StreamEvent,
  WEBSOCKET_REQUEST_TYPE,
  WebSocketPayload,
  type ConnectionEvent,
  type ConnectionStateEvent,
} from '@shared/protocol';
import { deepSubstitute } from '@shared/substitute';
import type { EnvelopeAuthSource } from '../execution-service';
import type { WsConnection, WsConnector } from './ws-port';
import type { SseStreamer } from './sse-port';
import { SseParser } from './sse-parser';

const EMPTY_ARTIFACTS: AuthArtifacts = { headers: {}, query: {}, cookies: {} };

export interface ConnectionSessionDeps {
  wsConnector: WsConnector;
  sseStreamer: SseStreamer;
  /** Resolves `{{variables}}` (VariableService.evaluate in prod). */
  evaluate: (template: string, context?: VariableContext) => string;
  /** Resolves an auth source to artifacts (AuthService.resolveArtifacts in prod). */
  resolveArtifacts?: (
    source: EnvelopeAuthSource,
    ctx: ApplyContext,
    evaluate: (template: string) => string,
  ) => Promise<AuthArtifacts>;
  /** Pushes an event/state transition to the renderer. */
  emitEvent: (payload: ConnectionEvent) => void;
  emitState: (payload: ConnectionStateEvent) => void;
}

interface Session {
  ws?: WsConnection;
  sse?: AbortController;
  closed: boolean;
}

/**
 * Manages live, interactive WebSocket/SSE connections keyed by a renderer-chosen
 * `sessionId` (Phase 7). Unlike the one-shot collect providers, a session stays
 * open, streaming frames to the renderer via `emitEvent` and lifecycle changes
 * via `emitState`, and (for WebSocket) accepts `send` until closed. Mirrors the
 * `inflightExecutions` map so all sessions can be torn down on window close.
 */
export class ConnectionSessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly deps: ConnectionSessionDeps) {}

  async open(sessionId: string, request: unknown): Promise<void> {
    if (this.sessions.has(sessionId)) throw new Error(`Session "${sessionId}" is already open`);
    const envelope = RequestEnvelope.parse(request);
    const evaluate = (template: string): string => this.deps.evaluate(template, envelope.variableContext);

    const session: Session = { closed: false };
    this.sessions.set(sessionId, session);
    this.deps.emitState({ sessionId, state: 'connecting' });

    try {
      if (envelope.type === WEBSOCKET_REQUEST_TYPE) {
        await this.openWebSocket(sessionId, session, envelope, evaluate);
      } else if (envelope.type === SSE_REQUEST_TYPE) {
        await this.openSse(sessionId, session, envelope, evaluate);
      } else {
        throw new Error(`Request type "${envelope.type}" does not support interactive sessions`);
      }
    } catch (err) {
      this.fail(sessionId, err instanceof Error ? err.message : String(err));
    }
  }

  send(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) throw new Error(`Session "${sessionId}" is not open`);
    if (!session.ws) throw new Error('This session does not support sending');
    session.ws.send(data);
    this.emit(sessionId, { at: Date.now(), direction: 'sent', kind: 'text', data });
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.closed = true;
    try {
      session.ws?.close(1000);
      session.sse?.abort();
    } catch {
      // best-effort
    }
    this.sessions.delete(sessionId);
    this.deps.emitState({ sessionId, state: 'closed' });
  }

  /** Tears down every session (window close / shutdown). */
  closeAll(): void {
    for (const sessionId of [...this.sessions.keys()]) this.close(sessionId);
  }

  private emit(sessionId: string, event: StreamEvent): void {
    this.deps.emitEvent({ sessionId, event });
  }

  private fail(sessionId: string, message: string): void {
    this.emit(sessionId, { at: Date.now(), direction: 'error', kind: 'error', data: message });
    this.deps.emitState({ sessionId, state: 'error', error: message });
    this.sessions.delete(sessionId);
  }

  private async resolveArtifacts(
    envelope: RequestEnvelope,
    applyCtx: ApplyContext,
    evaluate: (t: string) => string,
  ): Promise<AuthArtifacts> {
    if (!(envelope.auth || envelope.credentialId) || !this.deps.resolveArtifacts) return EMPTY_ARTIFACTS;
    return this.deps.resolveArtifacts(
      {
        ...(envelope.auth ? { auth: envelope.auth } : {}),
        ...(envelope.credentialId ? { credentialId: envelope.credentialId } : {}),
      },
      applyCtx,
      evaluate,
    );
  }

  private async openWebSocket(
    sessionId: string,
    session: Session,
    envelope: RequestEnvelope,
    evaluate: (t: string) => string,
  ): Promise<void> {
    const payload = deepSubstitute(WebSocketPayload.parse(envelope.payload ?? {}), evaluate) as WebSocketPayload;
    const artifacts = await this.resolveArtifacts(envelope, { url: payload.url.replace(/^ws/, 'http') }, evaluate);
    const headers = { ...payload.headers, ...artifacts.headers };
    const cookiePairs = Object.entries(artifacts.cookies).map(([n, v]) => `${n}=${v}`);
    if (cookiePairs.length > 0) headers['Cookie'] = [headers['Cookie'], ...cookiePairs].filter(Boolean).join('; ');

    const connection = this.deps.wsConnector.connect(payload.url, { headers, protocols: payload.subprotocols });
    session.ws = connection;

    connection.onOpen(() => {
      if (session.closed) return;
      this.deps.emitState({ sessionId, state: 'open' });
      this.emit(sessionId, { at: Date.now(), direction: 'info', kind: 'open', data: 'connected' });
    });
    connection.onMessage((data) => {
      if (session.closed) return;
      this.emit(sessionId, { at: Date.now(), direction: 'received', kind: 'text', data });
    });
    connection.onClose((info) => {
      if (session.closed) return;
      session.closed = true;
      this.sessions.delete(sessionId);
      this.deps.emitState({ sessionId, state: 'closed', code: info.code, ...(info.reason ? { reason: info.reason } : {}) });
    });
    connection.onError((error) => {
      if (session.closed) return;
      this.fail(sessionId, error.message);
    });
  }

  private async openSse(
    sessionId: string,
    session: Session,
    envelope: RequestEnvelope,
    evaluate: (t: string) => string,
  ): Promise<void> {
    const payload = deepSubstitute(SsePayload.parse(envelope.payload ?? {}), evaluate) as SsePayload;
    const artifacts = await this.resolveArtifacts(envelope, { method: payload.method, url: payload.url }, evaluate);
    const headers = { ...payload.headers, ...artifacts.headers };
    const controller = new AbortController();
    session.sse = controller;

    const result = await this.deps.sseStreamer.open({
      url: payload.url,
      method: payload.method,
      headers,
      ...(payload.method === 'POST' && payload.body ? { body: payload.body } : {}),
      signal: controller.signal,
    });
    if (result.status < 200 || result.status >= 300) {
      this.fail(sessionId, `SSE handshake failed with status ${result.status}`);
      return;
    }
    if (session.closed) return;
    this.deps.emitState({ sessionId, state: 'open' });

    // Drain the stream in the background, emitting each event live.
    void (async () => {
      const parser = new SseParser();
      try {
        for await (const chunk of result.chunks) {
          if (session.closed) return;
          for (const event of parser.push(chunk)) {
            this.emit(sessionId, { at: Date.now(), direction: 'received', kind: event.event, data: event.data });
          }
        }
        if (!session.closed) {
          session.closed = true;
          this.sessions.delete(sessionId);
          this.deps.emitState({ sessionId, state: 'closed' });
        }
      } catch (err) {
        if (!session.closed && !controller.signal.aborted) {
          this.fail(sessionId, err instanceof Error ? err.message : String(err));
        }
      }
    })();
  }
}
