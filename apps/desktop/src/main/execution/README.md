# Execution Module

The Request Execution Engine (Phase 10). Sends a request and returns a classified, timed response, consuming the variable resolver (Phase 8) and auth applier (Phase 9).

See [Architecture.md](./Architecture.md) and [Phase 10](../../../../../docs/PHASE_10.md).

## Public API

- `ExecutionService(transport, { evaluate? })`: `run(request, signal?)` → `ExecutionResponse`. Resolves variables, applies inline auth, builds the body, and runs the engine.
- `ExecutionEngine(transport)`: `execute(prepared, options?, signal?)` — retries, timeout, redirects, classification, metrics, cancellation.
- `FetchTransport` — production transport (runtime `fetch`, manual redirects).
- `buildPreparedRequest`, `classifyBody` — helpers.

## Notes

The engine is transport-agnostic; tests inject a fake transport. Stored credentials are decrypted into `request.auth` by the IPC layer before `run`. Body kinds: text, JSON, form, multipart, binary. Client-certificate mTLS wiring (custom undici Agent) is layered in during packaging (Phase 18).
