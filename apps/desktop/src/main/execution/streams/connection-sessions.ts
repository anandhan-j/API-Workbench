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
import type { RequestTypeRegistry } from '../../plugins/registries/request-type-registry';
import type { WsConnection, WsConnector } from './ws-port';
import type { SseStreamer } from './sse-port';
import { SseParser } from './sse-parser';

const EMPTY_ARTIFACTS: AuthArtifacts = { headers: {}, query: {}, cookies: {} };

/**
 * The port the manager drives plugin sessions through; implemented by the
 * plugin host manager. `open`/`send`/`close` call the host over RPC; `onEvent`/
 * `onState` deliver frames/lifecycle the host pushes back for a live session.
 */
export interface PluginConnectionPort {
  openConnection(req: {
    sessionId: string;
    pluginId: string;
    type: string;
    payload: Record<string, unknown>;
    artifacts?: AuthArtifacts;
  }): Promise<void>;
  sendConnection(req: { sessionId: string; pluginId: string; data: string }): Promise<void>;
  closeConnection(req: { sessionId: string; pluginId: string }): Promise<void>;
  onConnectionEvent(handler: (p: ConnectionEvent) => void): () => void;
  onConnectionState(handler: (p: ConnectionStateEvent) => void): () => void;
}

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
  /** Request-type registry, for resolving plugin providers' payload/auth. */
  requestTypes?: RequestTypeRegistry;
  /** Plugin-host connection port, for interactive plugin request types. */
  pluginConnections?: PluginConnectionPort;
  /** Pushes an event/state transition to the renderer. */
  emitEvent: (payload: ConnectionEvent) => void;
  emitState: (payload: ConnectionStateEvent) => void;
}

interface Session {
  ws?: WsConnection;
  sse?: AbortController;
  /** Set for a plugin-host session; its owning plugin id for send/close routing. */
  plugin?: { pluginId: string };
  closed: boolean;
}

/** Splits `plugin:<pluginId>/<type>` into its parts. */
function parsePluginType(qualified: string): { pluginId: string; type: string } | null {
  if (!qualified.startsWith('plugin:')) return null;
  const rest = qualified.slice('plugin:'.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  return { pluginId: rest.slice(0, slash), type: rest.slice(slash + 1) };
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

  constructor(private readonly deps: ConnectionSessionDeps) {
    // Plugin sessions live in the host; forward its pushed frames/state here,
    // filtering to sessions we own and cleaning up when the host ends one.
    deps.pluginConnections?.onConnectionEvent((p) => {
      if (this.sessions.get(p.sessionId)?.plugin) this.deps.emitEvent(p);
    });
    deps.pluginConnections?.onConnectionState((p) => {
      const session = this.sessions.get(p.sessionId);
      if (!session?.plugin) return;
      this.deps.emitState(p);
      if (p.state === 'closed' || p.state === 'error') this.sessions.delete(p.sessionId);
    });
  }

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
      } else if (parsePluginType(envelope.type)) {
        await this.openPlugin(sessionId, session, envelope, evaluate);
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
    if (session.ws) {
      session.ws.send(data);
    } else if (session.plugin) {
      void this.deps.pluginConnections
        ?.sendConnection({ sessionId, pluginId: session.plugin.pluginId, data })
        .catch((err: unknown) =>
          this.emit(sessionId, {
            at: Date.now(),
            direction: 'error',
            kind: 'error',
            data: err instanceof Error ? err.message : String(err),
          }),
        );
    } else {
      throw new Error('This session does not support sending');
    }
    this.emit(sessionId, { at: Date.now(), direction: 'sent', kind: 'text', data });
  }

  close(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.closed = true;
    try {
      session.ws?.close(1000);
      session.sse?.abort();
      if (session.plugin) {
        void this.deps.pluginConnections?.closeConnection({
          sessionId,
          pluginId: session.plugin.pluginId,
        });
      }
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

  private async openPlugin(
    sessionId: string,
    session: Session,
    envelope: RequestEnvelope,
    evaluate: (t: string) => string,
  ): Promise<void> {
    const parsed = parsePluginType(envelope.type)!;
    const registry = this.deps.requestTypes;
    const port = this.deps.pluginConnections;
    if (!registry || !port) {
      throw new Error('Interactive plugin sessions are unavailable');
    }
    // Resolve payload + auth exactly like ExecutionService.run, then hand the
    // resolved values to the host — the plugin sees substituted values only.
    const provider = registry.resolve(envelope.type);
    const payload = provider.resolveVariables(
      provider.payloadSchema.parse(envelope.payload ?? {}),
      evaluate,
    ) as Record<string, unknown>;
    const applyCtx = provider.buildApplyContext(payload, evaluate);
    const artifacts = await this.resolveArtifacts(envelope, applyCtx, evaluate);
    session.plugin = { pluginId: parsed.pluginId };
    await port.openConnection({
      sessionId,
      pluginId: parsed.pluginId,
      type: parsed.type,
      payload,
      artifacts,
    });
    // The host drives lifecycle from here via onConnectionEvent/onConnectionState.
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
