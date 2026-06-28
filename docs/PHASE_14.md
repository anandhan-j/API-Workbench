# Phase 14 — Workflow Runtime

This document records what the Phase 14 milestone delivers, the decisions taken, and its acceptance status. Phase 14 turns the deterministic linear runtime from Phase 12 into a full control-flow engine while keeping determinism intact.

## Delivered

**Control flow.** Three branch node kinds join the model. A **condition** node evaluates a `{{ template }}` and routes to its `true`/`false` edge. A **switch** node evaluates a value and routes to the matching case edge or `default`. A **loop** node repeats its `body` branch — a fixed number of `times`, or `while` a condition is truthy — then takes its `done` branch, with a hard iteration cap so runs always terminate. Branch selection travels on the edge's `sourceHandle`, so the graph (and the React Flow canvas) express flow declaratively.

**Reliability.** Any node may carry a `NodePolicy`: `retries` with `retryBackoffMs` between attempts, a `timeoutMs` that aborts a stuck node, and an `onError` strategy — `fail` (stop the run), `continue` (proceed), or `route` (follow an `error` edge). These are applied uniformly by the runtime around every node.

**Pause / resume / cancellation.** A `RunController` (cancellation signal + pause gate) is created per run and threaded to the engine, which checks it between nodes: it aborts promptly on cancel and suspends on pause until resumed. This is in-memory (a run is not persisted across app restarts). New IPC channels `workflow.pause` / `workflow.resume` join `workflow.cancel`, and the designer's run bar gains Pause/Resume and Cancel controls while a run is in flight.

**Graph validation.** The validator now permits branching (only from condition/switch/loop nodes — plus an optional `error` edge on any node) and cycles (loop back-edges), replacing Phase 12's strict linear/acyclic rule. Termination is guaranteed by per-loop caps and a global step limit rather than by acyclicity.

**Designer.** The palette, node renderer, and inspector gain the new kinds: branch nodes render multiple labelled source handles (and an `error` handle when a node routes errors), and the inspector adds per-kind config plus a collapsible **Reliability** section. Run statuses still colour nodes after a run.

The engine remains headless, deterministic, and unit-testable: every side effect — HTTP, evaluation, sub-workflow loading, time, and sleep — is an injected port.

## Key decisions

**Branch nodes + labelled edges.** Control flow is modelled as dedicated branch nodes whose outgoing edges are labelled, rather than guard expressions on every edge or nested body sub-graphs. This fits React Flow's handle model, keeps the flat node/edge graph the rest of the system already uses, and makes routing deterministic and easy to visualise.

**Loops as back-edges with caps.** A loop node is a decision point: its `body` edge leads into a subgraph that connects back to the loop node, which re-evaluates and eventually takes `done`. Iteration counters plus `times`/`maxIterations` caps and a global step limit guarantee termination, so cycles are safe to allow.

**Uniform per-node policy.** Retry, timeout, and error handling live in one optional `NodePolicy` on the node base and are applied by the runtime around any node, instead of being special-cased per kind. Error routing reuses the same labelled-edge mechanism via an `error` handle.

**In-memory pause/resume.** Phase 14 suspends and resumes a live run between nodes via a `RunController`; persisting run state across restarts was deliberately deferred to keep scope focused, with the controller designed so a persisted variant can be layered on later.

## Tests and verification

Fifty-four workflow tests pass in total. New Phase 14 coverage: condition true/false routing, switch case/default routing, loop `times` and `while` (including the iteration cap and the zero-iteration case), retry-then-succeed with attempt counting, node timeout, `onError` continue and route, cancellation, and pause→resume; plus `RunController` unit tests and the rewritten graph-validation tests (branching allowed only from branch nodes, error edges, cycles). The determinism guarantee is re-checked across a branching run. All workflow sources type-check cleanly on the node and web TypeScript projects.

## Acceptance criteria

Phase 14 requires a runtime that supports long-running workflows reliably. The engine executes conditions, loops, switch, retry, timeout, and error handling, supports cancellation and pause/resume, and remains deterministic and bounded. Sequential and (linear) execution, conditions, loops, switch, retry, timeout, error handling, resume, pause, and cancellation are implemented and tested.

## Next

Phase 15 adds workflow mapping and transformations (JSONPath/JMESPath/regex extraction, visual mapping, an expression editor) so a node's output can be captured into the runtime context that this phase threads between steps. See the [Roadmap](./ROADMAP.md).
