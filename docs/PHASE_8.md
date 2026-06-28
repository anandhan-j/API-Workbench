# Phase 8 — Variable Engine

This document records what the Phase 8 milestone delivers, the decisions taken, and its acceptance status. Phase 8 adds scoped variables, secret/encrypted values, a precedence-aware resolver, and a `{{ var }}` expression evaluator.

## Delivered

A variable engine (`VariableService` in `apps/desktop/src/main/variables`) plus the persistence, IPC, and UI to support it.

Variables exist at seven scopes — global, workspace, collection, folder, request, workflow, and runtime — and may be flagged **secret** (and, when an encryptor is available, stored **encrypted** at rest). They live in a single `variables` table (migration `0005`) accessed through a `VariableRepository`, exposed as `persistence.variables`.

The service provides CRUD (`set`/`list`/`get`/`delete`), a **resolver** (`resolve(context)`) that merges every scope present in the context by precedence into one map with decrypted values, a renderer-safe `resolvedKeys(context)`, and an **evaluator** (`evaluate({ template, context })`) that substitutes `{{ key }}` tokens against the resolved set.

It is wired to the renderer through `variable.list`, `variable.set`, `variable.delete`, `variable.evaluate`, and `variable.resolvedKeys` IPC channels and composed in the bootstrap (`new VariableService(service, new SafeStorageEncryptor())`). On the renderer, a new **Variables** route + sidebar entry hosts a panel to pick a scope (Global / Workspace), add key/value pairs, mark a value secret (shown masked), and delete.

## Key decisions

**Encryptor abstraction.** The service depends on an injected `Encryptor` interface (`isAvailable`/`encrypt`/`decrypt`) rather than Electron directly. The production implementation, `SafeStorageEncryptor`, wraps Electron `safeStorage` (the OS keychain) and lives in its own file that is never imported by tests or by any driver-agnostic module — only the composition root constructs it. Tests inject `NodeEncryptor`, an AES-256-GCM (`node:crypto`) implementation with a derived key, so secret handling is verified without the Electron runtime.

**Precedence order (low → high): global < workspace < collection < folder < request < workflow < runtime.** A variable defined at a higher scope overrides the same key at a lower one. Only scopes whose id is present in the resolution context are read; absent scopes are skipped. `runtime` is a plain key/value map passed in the context and is applied last, so it always wins.

**Global scope_id is `''`, not NULL.** All scopes share one table; `scope_id` identifies the owning entity. SQLite treats NULLs as distinct in a UNIQUE index, which would allow duplicate global keys, so global rows store the empty string and the `(scope, scope_id, key)` unique index applies uniformly.

**Secrets never cross IPC as plaintext.** `set` encrypts secret values when the encryptor is available (otherwise stores plaintext but still flags `secret`). The renderer-facing `Variable` DTO omits `value` for secrets and exposes only a `hasValue` flag; `resolvedKeys` carries names and secret flags but no values. Decryption happens only inside `resolve`, in the main process. `evaluate` runs in main and returns just the final substituted string.

**Template syntax.** `{{ key }}` substitutes the resolved value; `{{ key | default }}` falls back to `default` when the key is unresolved or empty; `{{$timestamp}}` and `{{$randomUUID}}` are dynamic built-ins (clock/uuid injectable for deterministic tests); an unknown token with no default collapses to the empty string.

## Tests and verification

Service tests (sql.js, `NodeEncryptor`) cover CRUD and upsert; the scopeId requirement for non-global scopes; **secret handling** — a secret is stored encrypted (raw value ≠ plaintext), masked in `list` (no `value`), and decrypted by `resolve`, plus the plaintext-fallback path when no encryptor is available; **precedence** — same key at all scopes resolves to the highest present, runtime overrides everything, absent scopes are ignored; and **evaluate** — substitution from the resolved precedence map, the `| default` syntax, empty replacement of unknown tokens, the deterministic built-ins, and `resolvedKeys` exposing flags without plaintext. Five React Testing Library tests cover the Variables panel (adding a non-secret and a secret variable, masking a secret value in the list, deleting, and the empty state).

The migrator and backup tests track the migration count via `MIGRATIONS.length` / `schemaVersion()`, so adding migration `0005` required no changes there. Migration `0005` creates the `variables` table with its unique and lookup indexes and drops it on rollback.

As in earlier phases, the headless sandbox verifies the service and renderer/shared TypeScript projects and the full vitest suite, but cannot launch Electron or compile the native driver; the live `SafeStorageEncryptor` path (OS keychain) runs on a developer workstation.

## Acceptance criteria

Phase 8 requires **correct variable precedence** and **secure secret handling**. Both are demonstrated directly. Precedence: the same key set at every scope resolves to the workflow value when all scopes are present, to the folder value when workflow/request are dropped, to global when the workspace scope is absent from the context, and to the runtime value when one is supplied. Secret handling: a secret is stored as ciphertext (verified against the raw row), is absent (masked) from the renderer-facing list, and is correctly decrypted during resolution; the OS-keychain encryptor is abstracted behind `Encryptor` so the secure path is real in production while remaining testable.

## Next

This completes the variable-engine milestone on the roadmap. See the [Roadmap](./ROADMAP.md).
