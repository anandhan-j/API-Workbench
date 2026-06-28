# Phase 11 — Testing & Assertions

This document records what the Phase 11 milestone delivers, the decisions taken, and its acceptance status. Phase 11 validates execution responses with assertions, schema checks, and custom scripts.

## Delivered

A testing engine under `apps/desktop/src/main/testing`.

The `TestRunner` evaluates a list of assertions against an `ExecutionResponse` and produces a report (totals, duration, and a per-assertion pass/fail with a message). Supported assertions: **status** (comparison or membership in a set), **header** (equals/contains/matches/exists), **body** via a JSONPath-lite resolver (`$.data.items[0].id`) with equality/contains/regex/numeric comparators, **response time**, **JSON Schema** validation (via `ajv`), and **custom JavaScript** tests run in a sandboxed `node:vm` context exposing a read-only `response` (with parsed `json`) and an `assert(condition, message)` helper under a wall-clock timeout. Each assertion is isolated, so one failure (or a throwing script) becomes a failed result rather than crashing the run — a report always covers every assertion.

It is wired over IPC (`test.run`) and composed in the bootstrap. The renderer **Run** page gains a Tests section: after a response, it runs a default `status < 400` assertion plus an optional custom script and renders a `TestReportView` with the pass/fail summary and per-assertion results.

## Key decisions

**Pure runner over a response.** Assertions operate on the already-captured `ExecutionResponse`, so the runner is pure and trivially testable, and the same response can be validated repeatedly.

**Sandboxed scripts.** Custom tests run in `node:vm` with a minimal, read-only context and a timeout — enough power for real assertions without exposing the host.

**Isolation per assertion.** Wrapping each assertion in its own try/catch guarantees a complete report and clear diagnostics even when one assertion errors.

## Tests and verification

Six tests cover status (comparison and membership), headers and response time, JSONPath body checks, JSON Schema validation (valid and invalid payloads), custom scripts (passing and failing with the failure message surfaced), and the report summary counts. The testing source type-checks cleanly. A renderer test covers the `TestReportView` summary and result rows.

The sandbox verifies typecheck and tests; the live GUI runs on a developer workstation.

## Acceptance criteria

Phase 11 requires that automated tests execute reliably and produce clear reports. The runner deterministically evaluates every supported assertion type, validates against JSON Schema, runs sandboxed custom scripts, and returns a structured report with per-assertion messages and totals — rendered in the UI. Assertions, JSON Schema validation, response validation, custom JavaScript tests, the test runner, and test reports are all implemented and tested.

## Next

This completes the core request lifecycle (import → organize → variables → auth → execute → test). Phases 12–15 build the workflow engine and designer on top. See the [Roadmap](./ROADMAP.md).
