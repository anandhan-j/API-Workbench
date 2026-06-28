# Variables Module

The variable engine (Phase 8). It manages scoped variables (global, workspace, collection, folder, request, workflow, runtime), encrypts secret values at rest, resolves a variable set for a given context by precedence, and evaluates `{{ key }}` templates against that set.

See [Architecture.md](./Architecture.md) and [Phase 8](../../../../docs/PHASE_8.md).

## Public API

- `VariableService` — the orchestrator. Construct it with a `PersistenceService` and an `Encryptor`.
  - `set({ scope, scopeId?, key, value, secret? })` — create/update a variable. Secrets are encrypted when the encryptor is available. Returns a **masked** `Variable`.
  - `list(scope, scopeId?)` / `get(scope, key, scopeId?)` — masked variables for the renderer (secret values omitted).
  - `delete(scope, key, scopeId?)`.
  - `resolve(context)` — merges scopes by precedence into a `Map<key, ResolvedVariable>` with **decrypted** secret values (main-process only). **Acceptance feature.**
  - `resolvedKeys(context)` — resolved keys with secret flags but no plaintext (renderer-safe).
  - `evaluate({ template, context })` — substitutes `{{ key }}` / `{{ key | default }}` / built-ins. **Acceptance feature.**

## Precedence

Low → high: `global` < `workspace` < `collection` < `folder` < `request` < `workflow` < `runtime`.

A variable defined at a higher scope overrides the same key at a lower one. Only scopes present in the context are pulled (e.g. without `workspaceId`, the workspace scope is skipped). `runtime` is a plain key/value map supplied in the context and always wins.

## Secrets

- A secret is stored encrypted (`encrypted = true`) when the injected `Encryptor.isAvailable()`; otherwise it is stored plaintext but still flagged `secret` so it is masked toward the renderer.
- `resolve` decrypts secret values inside the main process. `list`/`get` **never** return secret plaintext — the `Variable` DTO omits `value` for secrets and exposes only `hasValue`.

## Encryptor abstraction

`Encryptor` decouples the service from Electron so tests need no runtime:

- `SafeStorageEncryptor` (production) — wraps Electron `safeStorage` (OS keychain). Imports `electron`, so it is **never** imported by tests; only `main/index.ts` constructs it.
- `NodeEncryptor` (test/fallback) — AES-256-GCM via `node:crypto` with a derived key. Deterministic and reversible.

## Template syntax

- `{{ key }}` — replaced with the resolved value.
- `{{ key | fallback }}` — uses `fallback` when the key is unresolved or empty.
- `{{$timestamp}}` / `{{$randomUUID}}` — dynamic built-ins (clock/uuid injectable for tests).
- Unknown tokens with no default → empty string.

## Persistence

A single `variables` table (migration `0005-variables`). `scope_id` is `''` for global so the `(scope, scope_id, key)` unique index applies to global too (SQLite treats NULLs as distinct). See `persistence/repositories/variable-repository.ts`.
