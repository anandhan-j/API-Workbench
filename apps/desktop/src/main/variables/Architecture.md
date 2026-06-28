# Variables — Architecture

Phase 8. The variable engine adds scoped, optionally-secret variables and an expression evaluator on top of the existing persistence layer.

## Components

```
shared/variable.ts          DTOs: VariableScope, Variable (masked), ResolvedVariable,
                            VariableContext, SetVariableInput, EvaluateRequest, ResolvedKey
persistence/schema.ts       `variables` table (Drizzle)
persistence/migrations/     0005-variables.ts (raw SQL DDL)
persistence/repositories/   variable-repository.ts (CRUD, scope queries)
main/variables/
  encryptor.ts              Encryptor interface
  node-encryptor.ts         AES-256-GCM (node:crypto) — test/fallback impl
  safe-storage-encryptor.ts Electron safeStorage impl (production; never imported by tests)
  variable-service.ts       CRUD + resolve + evaluate
ipc/index.ts                variable.{list,set,delete,evaluate,resolvedKeys}
renderer/features/variables Variables UI (page, panel, hooks)
```

## Data model

One table holds every scope. `scope_id` distinguishes the owning entity and is the
empty string for `global`. The `(scope, scope_id, key)` UNIQUE index enforces one
value per key per scope; storing `''` rather than NULL for global keeps that
constraint effective (SQLite treats NULLs as distinct in unique indexes).

| column     | meaning                                            |
| ---------- | -------------------------------------------------- |
| scope      | one of the seven `VariableScope` values            |
| scope_id   | owning entity id; `''` for global                  |
| value      | plaintext, or base64 ciphertext when `encrypted`   |
| secret     | masked toward the renderer                         |
| encrypted  | whether `value` is ciphertext                      |

## Resolution & precedence

`resolve(context)` walks the scopes in ascending precedence —
`global → workspace → collection → folder → request → workflow → runtime` — writing
each scope's keys into a single map so later scopes overwrite earlier ones. Only
scopes whose id is present in the context are read. `runtime` is applied last from
`context.runtime`, so it always wins. Secret values are decrypted during this step,
which runs only in the main process.

## Security boundary

Secret plaintext never crosses IPC. `list`/`get` return a masked `Variable` whose
`value` is omitted for secrets. `resolvedKeys` exposes names + secret flags but no
values. `evaluate` runs in main and returns only the final substituted string. The
encryptor is injected, so the production OS-keychain path (`safeStorage`) is fully
decoupled from the testable core (`NodeEncryptor`).

## Evaluator

A single regex (`{{ key }}` / `{{ key | default }}`) drives substitution over the
resolved map, plus the `$timestamp` / `$randomUUID` built-ins (clock/uuid injectable
for deterministic tests). Unknown tokens with no default collapse to the empty string.
