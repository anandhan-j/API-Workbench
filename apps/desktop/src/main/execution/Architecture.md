# Execution — Architecture

The engine is layered so that everything except the actual socket is pure and testable.

**Transport seam.** `HttpTransport` is the only I/O boundary. `ExecutionEngine` sits above it and owns orchestration: per-attempt timeout via `AbortController`, retry with linear backoff (network errors and 5xx), bounded redirect following (recording the chain; 303 downgrades to GET), and cooperative cancellation by chaining an external `AbortSignal` into each attempt. Production uses `FetchTransport`; tests inject a scripted/recording fake, which is what makes retries, timeouts, redirects, and cancellation verifiable offline.

**Prepare vs. execute.** `ExecutionService` performs the impure-but-deterministic preparation: substitute `{{variables}}` (via an injected evaluator from the variable engine), apply inline auth (via the Phase 9 applier, merging headers/query/cookies), and build the request body with the correct content-type. It then hands a `PreparedRequest` to the engine. Keeping preparation separate means the engine has one job and the auth/variable concerns stay where they belong.

**Classification.** Responses are classified by content-type into json/xml/html/text/binary; JSON is pretty-printed and binary is base64-encoded, so the renderer can display any response without guessing.

**Boundary.** Stored-credential decryption stays in the IPC layer (which holds `AuthService`), so the engine never touches secrets directly. Diagnostics — status, timing, size, retries, redirect chain, errors — are returned in the typed `ExecutionResponse`.
