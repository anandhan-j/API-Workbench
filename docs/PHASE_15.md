# Phase 15 — Workflow Mapping & Transformations

This document records what the Phase 15 milestone delivers, the decisions taken, and its acceptance status. Phase 15 lets a workflow capture data out of one step and feed it into later steps, which is the payoff of the runtime context threaded since Phase 12.

## Delivered

**Response extraction on request nodes.** A request node gains an `extract` list of rules, each mapping part of the response to a runtime variable: `body` sources apply a **JSONPath**, **JMESPath**, or **regex** expression; `header` reads a named header; `status` captures the status code. After a request succeeds, every rule is applied and its value written to the runtime context, so a later node can reference `{{ variable }}`.

**Transform node.** A dedicated node computes a variable from existing context. Its `template` engine evaluates a `{{ template }}`; its `jsonpath` / `jmespath` / `regex` engines resolve an `input` template to text and apply an expression to it. This covers general value shaping beyond response capture.

**Shared extraction module.** All mapping logic lives in one pure module (`shared/extract.ts`) used by both the main-process engine (during a run) and the renderer (for live preview), so semantics are defined once and cannot drift. Every function is total — a non-matching path, malformed JSON, or invalid expression yields an empty string rather than throwing — which keeps runs deterministic and previews safe. Full JSONPath and JMESPath come from the `jsonpath-plus` and `jmespath` libraries; regex is native.

**Designer.** Request nodes get an "Extract (response → variables)" editor — add/remove rules with variable, source, engine, and expression — and the Transform node gets its own config. Both surface a **live data preview**: for the selected request node, each rule shows the value it would extract from that node's most recent run response.

## Key decisions

**Request extract + Transform node.** Mapping is offered in two complementary forms: inline extraction on the request that produced the data (the common "map outputs to the next request" case), and a standalone Transform node for general transformations. This satisfies both "map outputs visually" and "transform expressions" without forcing an extra node for every capture.

**Libraries for JSONPath/JMESPath.** Rather than hand-roll path engines, Phase 15 depends on `jsonpath-plus` and `jmespath` for full, correct query support, matching the project's production-quality bar. They are browser- and Node-compatible, so the same shared module runs in the engine and the preview.

**One shared, total extraction module.** Putting extraction in `shared/` (not the main process) lets the renderer preview use the exact code the engine runs, and making every function total avoids a class of run-time failures and makes the preview safe to call on every keystroke.

**Captured values flow through the existing runtime context.** Extraction writes into the same runtime variable map the engine already threads between nodes (ADR-0008), so no new propagation mechanism was needed — mapping is just another contributor of `variablesSet`.

## Tests and verification

Sixty-five workflow tests pass in total. New Phase 15 coverage: the pure extraction module (JSONPath, JMESPath, regex; body/header/status sources; object stringification; misses and malformed input returning empty; transform template and path modes), plus engine tests that a request node's extract rules populate runtime variables and that a transform node sets a variable (template and JSONPath-over-a-variable). All workflow sources type-check cleanly on the node and web TypeScript projects.

## Acceptance criteria

Phase 15 requires that users can map outputs to subsequent requests visually. The designer's extract editor and Transform node, backed by JSONPath/JMESPath/regex and a live preview, capture response data into runtime variables that later `{{ }}` references resolve — so a login request's token can flow into the next request's header, for example. JSONPath, JMESPath, regex extraction, transform expressions, visual mapping, an expression field per rule, and data preview are all implemented and tested.

## Next

Phase 16 is the Plugin SDK, which will let third parties register custom node types, request types, auth providers, and importers against the stable domain model these phases established. See the [Roadmap](./ROADMAP.md).
