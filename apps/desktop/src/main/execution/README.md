# Execution Module

The Request Execution Engine (Phase 10). Sends a request and returns a classified, timed response, consuming the variable resolver (Phase 8) and auth applier (Phase 9).

See [Architecture.md](./Architecture.md) and [Phase 10](../../../../../docs/PHASE_10.md).

## Public API

- `ExecutionService(transport, { evaluate? })`: `run(request, signal?)` → `ExecutionResponse`. Resolves variables, applies inline auth, builds the body, and runs the engine.
- `ExecutionEngine(transport)`: `execute(prepared, options?, signal?)` — retries, timeout, redirects, classification, metrics, cancellation.
- `FetchTransport` — production transport (runtime `fetch`, manual redirects).
- `buildPreparedRequest`, `classifyBody` — helpers.

## Built-in request-type providers (ADR-0009)

`ExecutionService.run` dispatches by `RequestEnvelope.type` through the `RequestTypeRegistry`. The built-in providers, all seeded at the composition root, live under `providers/` (each behind an injected port so tests use fakes):

- `http` (`providers/http-provider.ts`) — wraps `ExecutionEngine`.
- `graphql` (`providers/graphql-provider.ts`) — POST over the HTTP engine; lifts top-level `errors`, extras are an `HttpProtocolExtras` superset.
- `grpc` (`providers/grpc-provider.ts` + `grpc/`) — unary calls via a `GrpcInvoker` port (`@grpc/grpc-js` isolated in `grpc/grpc-client.ts`); `.proto` loaded from disk by `grpc/proto-loader.ts`.
- `websocket` / `sse` (`providers/*` + `streams/`) — one-shot **collect mode**: connect, collect frames until server close / `maxEvents` / `durationMs` / abort, return a `ProtocolResponse` whose body is a JSON array of received data and whose extras carry the `StreamProtocolExtras` timeline. Ports: `WsConnector` (`streams/ws-port.ts`), `SseStreamer` (`streams/sse-port.ts`), with `streams/sse-parser.ts` for the wire format.

`streams/connection-sessions.ts` (`ConnectionSessionManager`) runs **interactive** WebSocket/SSE sessions (Phase 7) over the `connection.*` IPC channels — a live connection with send + a pushed event stream, reusing the same ports plus the variable engine and auth resolver.

## Notes

The engine is transport-agnostic; tests inject a fake transport. Stored credentials are decrypted into `request.auth` by the IPC layer before `run`. Body kinds: text, JSON, form, multipart, binary. Client-certificate mTLS wiring (custom undici Agent) is layered in during packaging (Phase 18).
