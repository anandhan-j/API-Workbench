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
