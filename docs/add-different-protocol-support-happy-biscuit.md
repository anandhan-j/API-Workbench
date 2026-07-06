# Built-in Protocol Support: GraphQL, gRPC, WebSocket, SSE (UI + Workflows)

## Context

The app currently tests HTTP only. The user wants to test different protocols from the request UI **and** from workflow request nodes. The protocol abstraction already exists (ADR-0009): `RequestEnvelope { type, payload }` → `ExecutionService.run` dispatches via `RequestTypeRegistry` → `MainRequestTypeProvider.execute` → generic `ProtocolResponse`. HTTP is the only built-in provider; plugin request types already flow through the editor (SchemaForm), persistence (`requests.type` column + `details.pluginPayload`), workflows (`RequestNodeConfig {type, payload}`), history and assertions (`httpViewOf`/`statusOf` degrade gracefully).

**Scope (user-confirmed):** GraphQL, gRPC (unary), WebSocket, SSE — implemented as built-in providers end-to-end (protocol picker, protocol editors, response views, workflow nodes). WS/SSE ship first as **one-shot collect mode** (fits the existing one-shot `ProtocolResponse` with zero engine changes); interactive WS sessions are the final cut-safe phase.

**Key verified facts:**
- `HttpProtocolExtras` is non-strict → GraphQL extras can be a superset and inherit `statusOf`/`httpViewOf`/assertions for free.
- `extractFromResponse` (shared/extract.ts) reads only status/metadata/body → WS/SSE render collected messages as a JSON array in `response.body` and existing extract rules work unchanged.
- Wire DTOs pin `method` to the `HttpMethod` enum (`RequestSummary`, `TreeNode`, `RequestHistoryEntry`, `RequestDetailFull`, `request.update`), but the DB column is TEXT. The save flow never writes badge/target for non-HTTP today (`CollectionsPage.tsx:499` always sends draft.method/url) — a real gap to close.
- `RequestDetails.pluginPayload` (generic JSON bag) is reusable for built-in protocol payloads → **no migration needed**.
- The workflow-side HTTP lock is renderer-only: `request-node-draft.ts` (`draftToNodeConfig` hard-codes `type: HTTP_REQUEST_TYPE`, `nodeConfigToDraft` casts payload to `HttpPayload`) and the `NodeInspector.tsx` request branch (~lines 170–196).

**New deps (all pure JS, no electron-rebuild concern):** `@grpc/grpc-js`, `@grpc/proto-loader`, `ws` + `@types/ws`. SSE uses already-present `undici`.

**Decisions:**
- GraphQL: `ok = httpOk && errors.length === 0`; `summary.code` stays HTTP status; label e.g. `200 OK · 2 GraphQL errors`.
- gRPC proto input: absolute **file path** (+ optional import dirs) via a new `dialog.openPath` channel (proto-loader resolves imports relative to disk; existing `dialog.openFile` returns base64 content, not a path).
- Tree badges: widen `method` to `z.string()` in the five wire-DTO locations only (`HttpPayload.method` / `RequestDraft.method` keep the enum); compiler finds all consumers across both tsconfigs.
- Payload storage: reuse `details.pluginPayload` for built-in protocols (update its doc comment).
- Keep heavy deps (`@grpc/grpc-js`, `ws`) out of `shared/` and renderer-reachable modules; inject as ports so tests use fakes.

---

## Phase 1 — Shared types

Modify [apps/desktop/src/shared/protocol.ts](apps/desktop/src/shared/protocol.ts); new `apps/desktop/src/shared/substitute.ts` (+ test).

- Constants: `GRAPHQL_REQUEST_TYPE = 'graphql'`, `GRPC_REQUEST_TYPE = 'grpc'`, `WEBSOCKET_REQUEST_TYPE = 'websocket'`, `SSE_REQUEST_TYPE = 'sse'`, `BUILTIN_REQUEST_TYPES`.
- Payload Zod schemas:
  - `GraphqlPayload { url, query, variables (JSON text), operationName, headers }`
  - `GrpcPayload { target, protoFile, importDirs[], service, method, message (JSON text), metadata, useTls, deadlineMs }`
  - `WebSocketPayload { url, headers, subprotocols[], messages[{data, delayMs}], collect {maxEvents=50, durationMs=10000} }`
  - `SsePayload { url, method GET|POST, headers, body, collect }`
- Extras schemas: `GraphqlProtocolExtras = HttpProtocolExtras.extend({ graphqlErrors[] })`; `GrpcProtocolExtras { statusCode, statusName, metadata, trailers }`; `StreamEvent { at, direction sent|received|info|error, kind, data }`; `StreamProtocolExtras { events[], closeCode?, closeReason?, truncated? }`.
- `deepSubstitute(value, evaluate)` in `substitute.ts` — generic deep `{{var}}` substitution used by providers' `resolveVariables` (the existing `substitutePayload` in host-manager.ts is FormSchema-aware/top-level only).

## Phase 2 — GraphQL provider (main)

New `apps/desktop/src/main/execution/providers/graphql-provider.ts` + `__tests__/graphql-provider.test.ts`; register in [apps/desktop/src/main/index.ts](apps/desktop/src/main/index.ts) (`new RequestTypeRegistry([createHttpProvider(transport), createGraphqlProvider(transport), ...])`); export from `main/execution/index.ts`.

`createGraphqlProvider(transport)` builds a POST with JSON body `{query, variables, operationName}` and reuses `buildPreparedRequest` + `ExecutionEngine` exactly like [http-provider.ts](apps/desktop/src/main/execution/providers/http-provider.ts) (inherits retries/timeout/redirects/auth-artifact merge). Post-process: parse body JSON, lift `errors`, compute `ok`, emit `GraphqlProtocolExtras`. `summarize: {badge: 'GQL', target: url}`.

Tests (fake transport, pattern from `execution-service.test.ts`): success; 200-with-errors → ok:false; transport failure; variable resolution; auth headers; `statusOf`/`httpViewOf`.

## Phase 3 — gRPC unary provider (main)

New under `apps/desktop/src/main/execution/grpc/`:
- `proto-loader.ts` — `loadUnaryMethod(protoFile, importDirs, service, method)` → serializer/deserializer + method path; tested against a fixture `.proto` (offline).
- `grpc-client.ts` — `GrpcInvoker` port + `createGrpcInvoker()` prod impl over `@grpc/grpc-js` `makeUnaryRequest`; abort via `call.cancel()` on signal. **Only this file imports grpc.**
- `providers/grpc-provider.ts` — `createGrpcProvider(invoker)`: `resolveVariables = deepSubstitute`; auth `artifacts.headers` → gRPC metadata, `artifacts.tls` → channel creds, query/cookies ignored; `ok = statusCode === 0`; `summary.code = String(statusCode)`; `body` = pretty JSON of response message; `summarize: {badge: 'gRPC', target: 'target/service.method'}`.

New IPC channel `dialog.openPath` (`{filters?}` → `{canceled, path?}`) in [shared/ipc-contract.ts](apps/desktop/src/shared/ipc-contract.ts) + handler in `main/ipc/index.ts` (existing `dialog.openFile` returns content, not path). Add deps to `apps/desktop/package.json`. Tests: fake invoker; proto-loader fixture test.

Risk noted: absolute proto paths aren't portable across machines — acceptable v1, hint in UI placeholder.

## Phase 4 — WebSocket + SSE providers, collect mode (main)

New under `apps/desktop/src/main/execution/streams/`:
- `ws-port.ts` (`WsConnector` port) + `ws-connector.ts` (prod impl over `ws` — needed for handshake headers).
- `sse-parser.ts` (pure incremental `text/event-stream` parser: event/data/id/multi-line/comments) + `sse-port.ts`/`sse-stream.ts` (`SseStreamer` port, prod via undici).
- `providers/websocket-provider.ts`, `providers/sse-provider.ts`; register both in `main/index.ts`.

Collect semantics: connect → (WS) send configured messages after `delayMs` → append `StreamEvent`s → stop on server close / `collect.maxEvents` / `collect.durationMs` / abort → return one-shot `ProtocolResponse`: `body` = JSON array of received data (JSON-parsed per message when possible), `bodyKind: 'json'`, extras = `StreamProtocolExtras`, `metadata` = handshake headers (SSE). `options.timeoutMs` caps handshake; abort → `cancelled: true`. Auth: headers (+ cookies as `Cookie`) on handshake/request, query appended to URL; body-hash schemes (Digest/SigV4) documented unsupported for streams.

Tests: fake connector/streamer with scripted frames — ordering, maxEvents truncation, duration stop (short real timers), abort, extraction-ready JSON body; `sse-parser.test.ts`.

## Phase 5 — Runner UI (the bulk)

- New `apps/desktop/src/renderer/src/features/runner/request-type-meta.ts` — mirrors [workflows/node-meta.ts](apps/desktop/src/renderer/src/features/workflows/node-meta.ts): `BUILTIN_REQUEST_TYPE_META` (`{type, label, badge, badgeColor, defaultPayload(), targetOf(payload), toDraftParts(payload), toPayload(draft)}`) + plugin map + `getRequestTypeMeta(type)`. **Single round-trip authority** used by runner save, envelope build, and the workflow node bridge.
- New protocol editors in `features/runner/protocols/`: `GraphqlEditor.tsx` (query + variables JSON + operationName), `GrpcEditor.tsx` (target, proto path + Browse via `dialog.openPath`, service/method, message JSON, metadata rows, TLS, deadline), `WebSocketEditor.tsx` (url, subprotocols, scripted messages list, collect settings), `SseEditor.tsx` (url, GET/POST, body, collect settings). Each edits a typed view over `draft.pluginPayload`.
- New `StreamEventLog.tsx` — directional timeline (sent/received chips, timestamps, expandable payloads); styling per `dispatch-monitor/DispatchMonitor.tsx`.
- Modify [RequestEditor.tsx](apps/desktop/src/renderer/src/features/runner/RequestEditor.tsx): type select **always visible** (HTTP + four built-ins + plugin types). Built-in non-HTTP: badge + target input in address bar; keep Auth/Headers/Variables/Scripts(post-only)/Settings tabs; swap Params/Body for the protocol editor. Plugin types keep SchemaForm path. Pre-request script stays HTTP-only (guard exists).
- Modify [ResponseViewer.tsx](apps/desktop/src/renderer/src/features/runner/ResponseViewer.tsx): conditional sections — GraphQL errors list, gRPC status/trailers strip, `StreamEventLog` — each gated on its extras schema `safeParse`.
- Modify [build-request.ts](apps/desktop/src/renderer/src/features/runner/build-request.ts): `isProtocolDraft`; `buildRequestEnvelope` uses `meta.toPayload(draft)` for built-ins; `detailToDraft` seeds from `meta.defaultPayload()` when `pluginPayload` absent and coerces non-enum persisted `method` to `'GET'`.
- DTO widening: `method` → `z.string()` in `RequestSummary`, `TreeNode` request arm, `RequestHistoryEntry` ([shared/collection.ts](apps/desktop/src/shared/collection.ts)), `RequestDetailFull` (shared/request-details.ts), `request.update`/`request.create` channels. `CreateRequestInput` gains `type?`.
- Creation flow: [CollectionsPage.tsx](apps/desktop/src/renderer/src/features/collections/CollectionsPage.tsx) "+ request" becomes a type-picker menu (HTTP default + built-ins + plugin types) passing `type`; `onSave` writes `{method: meta.badge, url: meta.targetOf(payload)}` for non-HTTP drafts (closes the badge/target persistence gap). Pass `type` through `request.create` handler/repository (repo already accepts it).
- Tree: `CollectionTreeView.tsx` `METHOD_COLOR` gains `GQL`/`gRPC`/`WS`/`SSE` + neutral fallback for unknown badges.

Tests: `build-request.test.ts` round-trips per protocol (detail → draft → envelope → details); component tests for StreamEventLog / type picker.

## Phase 6 — Workflow request nodes

- [request-node-draft.ts](apps/desktop/src/renderer/src/features/workflows/request-node-draft.ts): `nodeConfigToDraft` reads `config.type` — non-HTTP → `defaultDraft()` + `{requestType: config.type, ...meta.toDraftParts(config.payload)}`; `draftToNodeConfig` takes `type`/`payload` from `buildRequestEnvelope(draft)` (deletes the `HTTP_REQUEST_TYPE` hard-code at line 119).
- [NodeInspector.tsx](apps/desktop/src/renderer/src/features/workflows/NodeInspector.tsx) request branch (~170–196): render `getRequestTypeMeta(config.type).badge` + `targetOf(config.payload)` instead of casting to `HttpPayload`; still opens the (now protocol-aware) RequestEditor.
- `node-meta.ts`: request node description mentions all protocols; single palette entry — protocol chosen inside the editor.
- `RunPanel.tsx`: already protocol-agnostic; add `StreamEventLog` when stream extras parse.
- Extraction: **no changes** (status→summary.code, header→metadata, body→JSON events/message). Optional: per-type placeholder hints in `ExtractEditor`.

Tests: `request-node-draft.test.ts` round-trips a config of each type (regression for the hard-code bug); engine test in `main/workflows/__tests__` with a fake `executeRequest` returning stream extras, asserting body extraction of an event field.

## Phase 7 — Interactive WebSocket sessions (cut-safe; ships last)

- IPC: `connection.open` (`{sessionId, request: RequestEnvelope}`), `connection.send` (`{sessionId, data}`), `connection.close` (`{sessionId}`); push events `connection.event` (`{sessionId, event: StreamEvent}`) and `connection.state` (`{sessionId, state, code?, reason?, error?}`). Extend contract, preload `WorkbenchApi` allowlist + subscriptions.
- New `main/execution/streams/connection-sessions.ts`: `ConnectionSessionManager` — session map (mirrors `inflightExecutions` in `main/ipc/index.ts:52`), injected `WsConnector`/`SseStreamer` + `emit` callback (no electron imports); reuses provider `payloadSchema`/`resolveVariables`/`buildApplyContext` + `resolveArtifacts` via a small `openStream(envelope)` helper on `ExecutionService`. Close all sessions on window close.
- New `ConnectionPanel.tsx` + `use-connection.ts` (zustand, à la `stores/dispatch-store.ts`): Connect/Disconnect, live `StreamEventLog`, WS message composer. RequestEditor gets a "Single-shot / Interactive" toggle for ws/sse types.

Tests: `connection-sessions.test.ts` with fake connector — open/send/receive/close lifecycle, event order, cleanup, double-open rejection.

## Cross-cutting

- Docs: extend `docs/adr/0009-protocol-abstraction.md` (built-in providers, collect-mode decision); ADR-0011 for connection sessions; update `main/execution/README.md`.
- Cancellation: every provider honors `ctx.signal` (engine / `call.cancel()` / close-on-abort) so `request.cancel` and workflow cancel work uniformly.
- Suggested order: 1→2 first (proves the pattern end-to-end), then 3, 4, 5, 6, 7.

## Verification

- `npm run typecheck` (both tsconfigs — the `method` widening must compile everywhere), `npm run lint`, `npm test`.
- Unit: each provider against fakes; sse-parser; round-trip tests (build-request, request-node-draft).
- End-to-end (`npm run dev`): create one request per protocol via the new type picker; GraphQL against a public endpoint (e.g. countries.trevorblades.com); WS echo against wss://echo.websocket.org (or a local `ws` echo script in scratchpad); SSE against a local script emitting events; gRPC against a local `@grpc/grpc-js` test server + fixture proto. Verify send/response views, save/reload round-trip, tree badges, history entries.
- Workflow: build a workflow with a GraphQL node and a WS collect node; extract a field from the events JSON into a variable; confirm RunPanel rendering and extraction.
- Phase 7: connect/send/receive/disconnect in the interactive panel; verify session cleanup on window close.

## Risks

- `RequestEditor.tsx` growth — mitigated by the meta table + per-protocol components.
- `method` widening — the compiler surfaces every `HttpMethod` consumer; audit during the change.
- Proto path portability across machines (v1 accepts absolute paths).
- Long `collect.durationMs` blocks a workflow node — defaults kept small (10 s / 50 events).
