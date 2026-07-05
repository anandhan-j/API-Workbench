# ADR-0009: Protocol-agnostic request execution

- **Status:** Accepted
- **Date:** 2026-07-02
- **Related:** ADR-0003, ADR-0005, ADR-0007

## Context

Until Phase 16 the execution stack was HTTP-only: the wire DTOs (`ExecutionRequest`/`ExecutionResponse`), the persisted request row, the workflow request node, the response viewer, scripting (`pm.response`), assertions, and extraction all assumed an HTTP status/header/body shape. The Plugin SDK (ADR-0007) requires **custom request types** — gRPC, GraphQL, MQTT, anything a plugin can execute — which have no home in that model. Bolting a second execution path onto the side would duplicate auth, variables, cancellation, history, and the viewer.

## Decision

We introduce a **request envelope** and a **protocol response** as the single execution wire format, with per-type providers behind a registry.

A `RequestEnvelope` carries `type` (`'http'`, or `plugin:<pluginId>/<type>`), an opaque `payload` validated by the resolved provider's schema, and the cross-cutting concerns that stay envelope-level: inline auth or a stored `credentialId`, options, cancellation id, and variable context. A `ProtocolResponse` is the shape every protocol can fill — a summary chip (`label`/`tone`/`code`), a header-like `metadata` map, body/bodyKind/timings/size — plus an opaque `protocol` bag for type-specific extras (HTTP: status, statusText, headers, redirects, retries).

`ExecutionService` becomes a dispatcher: resolve provider → validate payload → resolve variables (provider hook) → resolve auth artifacts (`AuthService.resolveArtifacts`, async, plugin-aware) → `provider.execute`. The pre-envelope HTTP pipeline moved verbatim into the built-in `http` provider; retry/timeout/redirect/classification semantics are unchanged. Consumers with status/header semantics (assertions, `pm.response`, condition scripts, extraction) read a derived **HTTP view** (`httpViewOf`): real fields for HTTP, summary/metadata degradation for other types — so tests and mappings are protocol-agnostic by construction.

**Auth on non-HTTP protocols:** `AuthArtifacts` (headers/query/cookies/tls) is kept as the universal currency; providers interpret it — they MUST apply `headers` wherever their protocol has a header/metadata concept and MAY ignore the rest. `ApplyContext.method`/`body` became optional; HTTP-shape-signing appliers (Digest, AWS SigV4) raise a typed error without them, which is the correct surfacing of a genuine user error.

**Backwards compatibility is lossless and shim-based:** a Zod preprocess lifts legacy flat HTTP requests (wire and persisted workflow graphs) into envelopes at parse time; migration 0010 adds `requests.type` defaulting to `'http'`; non-HTTP rows store the provider's display badge/target in the NOT-NULL `method`/`url` columns so the tree and history render unchanged. No data migration rewrites user content.

## Alternatives considered

**A parallel execution path for plugin request types** was rejected: it forks auth, variables, cancellation, persistence, and the viewer, and the two paths inevitably drift. **Making every DTO fully generic (no HTTP specifics anywhere)** was rejected because HTTP is the product's center of gravity — burying its status/redirect/retry detail behind generic maps would degrade the primary UX to serve hypothetical protocols. The `protocol` extras bag keeps full HTTP fidelity at zero cost to other types. **A breaking schema change with data migration** was rejected; parse-time lifting achieves the same end state with zero risk to existing databases and exports.

## Consequences

Request types are now an open set: a plugin registers a provider plus a declarative payload form, and execution, auth, history, scripting, testing, and extraction work against it without modification. The costs: every consumer of the old `ExecutionResponse` had to move to `ProtocolResponse` (done in Phase 16 across main, shared, and renderer); the legacy-lifting preprocessors must live as long as pre-16 data can exist; and `method`/`url` columns now carry display summaries for non-HTTP rows, which diff/search treat as opaque strings.

## Addendum (2026-07-05): Built-in protocols & interactive sessions

Phase 16 shipped HTTP as the only built-in provider, with everything else arriving via plugins. This addendum records the first-party protocols added on top of the same abstraction — no new execution path, no schema migration.

**Built-in providers.** Four `MainRequestTypeProvider`s were registered alongside `http` in `RequestTypeRegistry` at the composition root: `graphql`, `grpc`, `websocket`, `sse`. Each takes an injected transport/client port so it is unit-testable with a fake:

- **GraphQL** reuses the HTTP `ExecutionEngine` — it is a POST of `{query, variables, operationName}`. Its extras are a *superset* of `HttpProtocolExtras` (so `statusOf`/`httpViewOf`/status assertions work unchanged) plus the operation's top-level `errors`. Semantics: `ok = httpOk && errors.length === 0` — a 200 with GraphQL errors is a failed operation.
- **gRPC (unary)** loads a `.proto` from disk (`@grpc/proto-loader`) and dials one call (`@grpc/grpc-js`, isolated in `grpc/grpc-client.ts` so tests never import it). Auth `headers` map to gRPC metadata; `summary.code` is the numeric gRPC status. The `.proto` is a **file path** (+ import dirs) picked via a new `dialog.openPath` channel, because proto-loader resolves `import`s relative to on-disk files.
- **WebSocket & SSE** run in **one-shot collect mode**: connect, send configured messages (WS), collect frames until server close / `maxEvents` / `durationMs` / abort, and return a normal `ProtocolResponse` whose body is a JSON array of received message data (so existing jsonpath/regex extraction reaches event fields) and whose `protocol` extras carry the full directional `StreamProtocolExtras.events` timeline. This keeps history, workflows, and the generic viewer working with zero engine changes.

**Interactive sessions (Phase 7).** Collect mode can't model a live, bidirectional WebSocket. A `ConnectionSessionManager` (main) holds sessions keyed by a renderer-chosen `sessionId` (mirroring the `inflightExecutions` map) and pushes frames/lifecycle over two new event channels (`connection.event`, `connection.state`); three request channels (`connection.open/send/close`) drive it. It reuses the variable engine and `AuthService.resolveArtifacts`, and `closeAll()` runs on `before-quit`. The runner's response pane gains a Single-shot / Interactive toggle for `websocket`/`sse`.

**Wire display widening.** Non-HTTP rows already stored a badge/target in `method`/`url`; those badges (`GQL`, `gRPC`, `WS`, `SSE`) are not `HttpMethod` values, so the display DTOs (`RequestSummary`, `TreeNode`, `RequestHistoryEntry`, `RequestDetailFull`, `VersionRequest`, `DiffRequest`, and the `request.update`/`request.create` inputs) widen `method` to a `MethodBadge` (`z.string()`). The runner's own editor draft keeps the strict `HttpMethod`; only these outward DTOs widen. `TreeNode` also gained an optional `requestType` so the tree can color a per-protocol badge. Built-in protocol payloads reuse the existing `RequestDetails.pluginPayload` bag — no migration.

## Addendum (2026-07-05): Interactive plugin protocols

Interactive sessions (Phase 7) initially handled only the built-in `websocket`/`sse` types. Plugin request types now reach full parity:

- **Creation & display.** Plugin request types appear in the collection tree's "Add request" menu alongside HTTP and the built-in protocols, and non-HTTP badges (including plugin badges) get a color in the tree. Response rendering was already parity — `RequestExecuteResult.protocol` flows through untouched, so a plugin that emits `StreamProtocolExtras`/`GraphqlProtocolExtras`/`GrpcProtocolExtras` gets the matching rich view for free.
- **Interactive sessions.** A request-type contribution may declare `interactive: true`; its `RequestTypeProvider` then implements `openConnection(input)` (returning a `{ send?, close }` handle) instead of one-shot `execute`. New RPC methods `connection.open/send/close` (main→host) drive the session, and the host pushes frames/lifecycle via the existing fire-and-forget `event` channel under the `connection.event`/`connection.state` topics. The host runtime keeps a per-`sessionId` connection map and tears sessions down on `connection.close` or plugin deactivate; the `PluginHostManager` exposes a `PluginConnectionPort` (open/send/close + event subscription).
- **One session manager.** `ConnectionSessionManager` owns both built-in and plugin sessions keyed by the renderer's `sessionId`. For a `plugin:<id>/<type>` envelope it resolves payload/variables/auth through the request-type registry (exactly as `ExecutionService.run` does — the plugin sees substituted values only), calls the port's `openConnection`, and forwards the host's pushed frames to the renderer's `connection.event`/`connection.state` channels. Send/close route back to the owning plugin. The runner's Single-shot / Interactive toggle now shows for any `interactive` plugin type; `plugins/examples/interactive-echo` is the reference implementation.
