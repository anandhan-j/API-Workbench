# ADR-0005: Separate the workflow domain model from the React Flow canvas

- **Status:** Accepted
- **Date:** 2026-06-27
- **Related:** ADR-0001, ADR-0007

## Context

Workflows are a defining capability of API Workbench: users compose multi-step API interactions visually and run them with sequential/parallel execution, conditions, loops, switch, retry, timeout, and error handling. The visual designer (Phase 13) is built on React Flow, a renderer-side library concerned with nodes, edges, pan/zoom, and interaction. The runtime (Phase 14) must execute workflows deterministically in the main process, propagate variables, and support long-running, pausable, resumable executions. The acceptance criterion is determinism. Coupling execution semantics to the canvas library would put core business logic in the renderer, tie it to a UI dependency, and make it untestable in isolation.

## Decision

We will model workflows as a **framework-independent domain model** in the `workflows` feature's domain layer — nodes, edges, ports, execution context, and the rules governing them — entirely separate from React Flow. React Flow is used only as a *view and editing surface* that reads from and writes to this domain model; it carries no execution semantics. The runtime executes the domain model in the main process and is deterministic and headless, so it can be unit-tested without any UI. The canvas serialises to and deserialises from the persisted workflow model, which is the single source of truth.

## Alternatives considered

**Driving execution directly from the React Flow graph** was rejected because it places core logic in the renderer, couples it to a UI library's data structures, and makes deterministic, testable, long-running execution effectively impossible. **A purely imperative script representation** (no visual model) was rejected because the product requires a visual designer and reusable visual components. **Embedding a third-party workflow engine** was rejected because the execution semantics (variable propagation across API steps, mapping, retry/resume tailored to HTTP) are domain-specific and need to be owned and versioned by the project.

## Consequences

The runtime is deterministic, headless, and unit-testable, and the canvas can evolve (or even be replaced) without touching execution semantics. Workflows persist as a stable domain model that versioning and the plugin SDK can target. The cost is maintaining an explicit mapping between the React Flow representation and the domain model, and the discipline of never letting execution logic leak into UI components. Custom node types from the plugin SDK (ADR-0007) extend the domain model and register a corresponding canvas renderer, keeping the separation intact.
