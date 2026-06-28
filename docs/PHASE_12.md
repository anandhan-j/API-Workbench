# Phase 12 — Workflow Engine

This document records what the Phase 12 milestone delivers, the decisions taken, and its acceptance status. Phase 12 turns the request lifecycle into composable, multi-step workflows that execute deterministically.

## Delivered

A workflow engine under `apps/desktop/src/main/workflows`, its persistence, the IPC surface, and a visual designer in the renderer.

The domain model (`shared/workflow.ts`) describes a workflow as a graph of nodes and edges. Six node kinds are supported: **start**, **request** (executes through the Phase 10 engine), **set-variable** (writes a runtime variable from a `{{ template }}`), **delay**, **sub-workflow** (runs another workflow as a reusable component), and **end**. The graph is framework-independent and is the single source of truth for both the designer and the runtime (ADR-0005).

The `WorkflowEngine` is a deterministic, headless runtime. After `validateGraph` checks the structural invariants — exactly one start, every edge resolves, no node has more than one outgoing edge (no branching until Phase 14), and the path is acyclic — it walks the graph from the start node following each node's single outgoing edge. It threads an explicit execution context: a mutable runtime variable map that `set-variable` and `sub-workflow` nodes write and every node reads, so values propagate from each step to the next (ADR-0008). Each node yields a `NodeRunResult` (status, duration, message, optional response/variables); a failed node stops the run, an aborted signal yields `cancelled`, and sub-workflows execute into the same run with cycle and depth guards. Every side effect — HTTP execution, variable evaluation, sub-workflow loading, time — is an injected port, so the runtime is unit-tested without Electron, the network, the database, or the clock.

The `WorkflowService` owns CRUD over the new `workflows` table (migration `0009-workflows`, via `WorkflowRepository`) and orchestrates runs by composing the engine with the execution and variable engines. It is wired over IPC (`workflow.list/get/create/save/delete/run/cancel`) and composed in the bootstrap.

The renderer gains a **Workflows** page built on React Flow: a draggable node palette, a canvas that edits the domain graph (add via drag-and-drop, connect, select, delete, pan/zoom, minimap), a per-node inspector, and a run panel that shows each node's status and the final variables. Per ADR-0005 the canvas is purely a view/edit surface — it serialises to and from the domain graph and carries no execution semantics.

## Key decisions

**Domain model separate from the canvas (ADR-0005).** Execution lives in the main process over a framework-independent graph; React Flow only edits that graph. This keeps the runtime deterministic, headless, and testable, and lets the canvas evolve independently.

**Execution context as a propagated runtime map (ADR-0008).** A single runtime variable map is threaded through the run and reuses the Phase 8 evaluator and the Phase 10 execution path, rather than introducing a second templating language or per-node response mapping (which is Phase 15).

**Linear graph only, by design.** Branching, loops, switch, and parallel execution are Phase 14, so the validator rejects fan-out now rather than executing it ambiguously. This keeps Phase 12 deterministic and within scope.

**Ports for every side effect.** HTTP, evaluation, sub-workflow loading, clock, and sleep are injected, making the engine pure given its inputs.

## Tests and verification

Twenty-six tests cover the phase. The engine tests verify ordered execution, variable propagation into later nodes, determinism (identical inputs produce identical results), request-node failure stopping the run, non-2xx treated as completed, the injected delay, sub-workflow execution with variable merge, sub-workflow recursion detection, and cancellation. The graph tests cover the structural invariants (missing/duplicate start, unknown edges, branching rejection, cycle detection). The service tests run against in-memory SQLite and cover create/list/save/delete and an end-to-end run with propagated context. A renderer test covers the graph ⇄ React Flow mapping. The new workflow sources type-check cleanly on both the node and web TypeScript projects; the live designer runs on a developer workstation.

## Acceptance criteria

Phase 12 requires that workflows execute deterministically. The runtime walks a validated graph with no hidden state or reliance on real time, threads an explicit execution context, propagates variables between nodes, supports reusable components via sub-workflows, and returns a structured per-node result — verified by a determinism test that compares full run results. Workflow model, persistence, node execution, execution context, variable propagation, and reusable components are all implemented and tested.

## Next

Phase 13 builds out the full visual designer (grouping, undo/redo, clipboard) on the canvas introduced here; Phase 14 adds the workflow runtime's control flow (conditions, loops, switch, retry, pause/resume); Phase 15 adds visual data mapping that writes into the same execution context. See the [Roadmap](./ROADMAP.md).
