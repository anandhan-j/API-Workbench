# Testing Module

The Testing & Assertions engine (Phase 11). Validates an `ExecutionResponse` and produces a report.

See [Architecture.md](./Architecture.md) and [Phase 11](../../../../../docs/PHASE_11.md).

## Public API

- `TestRunner.run(response, assertions)` → `TestReport` (totals, duration, per-assertion results).
- `evaluateSimple`, `jsonPath`, `tryParseJson` — body/status/header/time assertions.
- `validateJsonSchema(schema, data)` — JSON Schema via `ajv`.
- `runScript(code, response)` — sandboxed custom JS (`node:vm`).

## Assertion types

`status` (compare or membership), `header`, `body` (JSONPath-lite + comparators), `jsonSchema`, `responseTime`, and `script` (custom JS with `response` + `assert`). Each assertion is isolated, so the report always covers every assertion.
