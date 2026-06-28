# Testing — Architecture

The engine is a pure function of `(response, assertions) → report`, which is what makes it reliable and trivially testable.

**Dispatch by type.** `TestRunner` walks the assertions and dispatches each to a specialized evaluator: simple assertions (status/header/body/responseTime) are pure comparisons; `jsonSchema` delegates to `ajv`; `script` runs in a sandbox. Every evaluation is wrapped so a thrown error becomes a failed result — a report always covers all assertions, never aborts midway.

**JSONPath-lite.** Body assertions resolve a `$.a.b[0].c` path against the parsed JSON with a tiny tokenizer, avoiding a heavy dependency while covering the common cases.

**Sandboxed scripts.** Custom tests run via `node:vm` in a fresh context exposing a read-only `response` (status, headers, body, parsed `json`, timings) and an `assert(condition, message)` helper, under a wall-clock timeout. This gives users real assertion power without granting host access — no `require`, no filesystem, no network.

**Boundary.** The runner depends only on the shared `ExecutionResponse`/`Assertion` DTOs and `ajv`. It is exposed over IPC (`test.run`) and consumed by the renderer's report view; it holds no state, so the same response can be validated repeatedly.
