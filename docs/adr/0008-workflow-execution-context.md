# ADR-0008: Workflow execution context as a propagated runtime variable map

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Principal Architect
- **Related:** ADR-0005, Phase 8 (Variable Engine), Phase 10 (Request Execution), Phase 15 (Workflow Mapping)

## Context

A workflow is a sequence of steps that must share data: a request's outcome or a computed value needs to be available to later steps (an auth token feeding subsequent requests, an id captured for a follow-up call). Phase 12 must define *how* state flows between nodes and do so deterministically, which is the phase's acceptance criterion. Two capabilities already exist and should not be duplicated: the variable engine (Phase 8) resolves `{{ tokens }}` across scopes including a `workflow` scope and an always-winning `runtime` map, and the execution engine (Phase 10) already substitutes variables and applies auth when given a variable context. The full visual data-mapping language (JSONPath/JMESPath/regex extraction from responses) is explicitly Phase 15 and must not be pulled forward.

## Decision

We will model the workflow execution context as a **single mutable runtime variable map threaded through the run**. The engine seeds it from the run request, and each node interacts with it uniformly: `set-variable` nodes evaluate a `{{ template }}` and write a key; `sub-workflow` nodes run with the current map and merge their final variables back; `request` nodes execute with the map supplied as their variable context's `runtime`, so propagated values resolve through the existing Phase 10 path. We will extend the execution variable context with an optional `workflowId` so workflow-scoped variables resolve for request nodes too. The map after the last node is returned as `finalVariables`. All variable substitution reuses the Phase 8 evaluator; the engine introduces no new templating.

## Alternatives considered

**Per-node response mapping now** (extract fields from each response into named outputs via JSONPath/JMESPath) was rejected because it is the defined scope of Phase 15; building it here would blur phase boundaries and duplicate work. **Passing the full result list to every node** (letting nodes reach into any prior node's response) was rejected as non-deterministic to reason about and a leaky coupling that would make later refactors and parallelism (Phase 14) harder. **A separate, bespoke expression language for workflows** was rejected because the variable engine already provides scoped resolution and `{{ }}` evaluation; a second language would fragment the product.

## Consequences

Data flow is explicit, uniform, and deterministic: one map, written by `set-variable`, read by everyone, returned at the end — easy to test and to display in the run panel. Reusing the Phase 8 evaluator and Phase 10 execution path means workflows inherit secrets, scopes, and auth for free. The cost is that Phase 12 cannot yet capture arbitrary response fields into variables; authors must use `set-variable` for values they can express as templates. Phase 15 will add response mapping by writing into this same runtime map, so it extends rather than replaces this model, and Phase 14's control flow operates over the same context.
