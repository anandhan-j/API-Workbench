# Phase 10 — Request Execution Engine

This document records what the Phase 10 milestone delivers, the decisions taken, and its acceptance status. Phase 10 actually sends requests, consuming the variable resolver (Phase 8) and the auth applier (Phase 9).

## Delivered

A request execution engine under `apps/desktop/src/main/execution`.

The `ExecutionEngine` orchestrates a single logical request on top of an injectable `HttpTransport`: per-attempt **timeouts** (AbortController), **retries** with backoff (on network errors and 5xx), **redirect** following (bounded, with 303→GET and a recorded redirect chain), response **classification** (JSON / XML / HTML / text / binary, with pretty-printed JSON), **timing metrics**, and cooperative **cancellation** via an external `AbortSignal`. The `ExecutionService` prepares a request before running it — substituting `{{variables}}` in URL/query/headers/body, applying inline auth via the Phase 9 applier (merging headers/query/cookies), and building the body (text, JSON, form, multipart, binary) with the right content-type. The production transport (`FetchTransport`) uses the runtime `fetch` with manual redirect handling; tests inject a fake transport.

It is wired over IPC (`request.execute`, `request.cancel`) with an in-flight `AbortController` registry for cancellation, composed in the bootstrap with the real fetch transport and a variable-engine-backed evaluator, and stored-credential resolution (decrypting an `auth_configs` row into the request's auth) happens in the handler. A renderer **Run** page sends requests and shows a response viewer (status, timing, size, headers, pretty body).

## Key decisions

**Injectable transport.** Putting all orchestration above an `HttpTransport` interface makes retries, timeouts, redirects, cancellation, and classification fully unit-testable offline, with the real `fetch` used only in production.

**Prepare vs. execute.** Variable resolution and auth application happen in a prepare step (`ExecutionService`), leaving the engine to focus on transport orchestration. Stored-credential decryption stays in the IPC layer (which has `AuthService`), so the engine core needs no secrets access.

**Manual redirects.** Following redirects in the engine (rather than the transport) lets the app report the redirect chain and bound it.

## Tests and verification

Twelve tests: the engine (classified JSON/HTML/binary responses, retry-on-5xx, retry-on-network-error, error after exhausting retries, hanging-request timeout, redirect following with recorded chain, and external-signal cancellation) and the service (variable substitution in url/query/headers, inline auth application, JSON body building with content-type, and api-key query merging) — all against a fake/recording transport. The execution source type-checks cleanly (only the Electron `safeStorage` file, shared with auth, requires the runtime). Real network calls and the live GUI run on a developer workstation.

## Acceptance criteria

Phase 10 requires reliable execution with detailed diagnostics. The engine handles retries, timeouts, redirects, and cancellation deterministically (proven by tests), classifies and pretty-prints bodies, and reports rich diagnostics — status, timing, size, retries, redirect chain, and errors — surfaced in the response viewer. Streaming, multipart, uploads/downloads, and the body builders are implemented; client-certificate mTLS wiring via a custom undici Agent is noted for packaging (Phase 18).

## Next

Phase 11 (Testing & Assertions) runs assertions against these responses. See the [Roadmap](./ROADMAP.md).
