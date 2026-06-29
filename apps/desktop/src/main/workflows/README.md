# Workflows Module

The workflow engine (Phase 12). It owns the workflow domain model, persists workflow definitions, and executes them deterministically and headlessly in the main process. Workflows are multi-step API interactions composed of nodes (start, request, set-variable, delay, sub-workflow, end) wired into a linear graph; the engine walks that graph one node at a time, threading an execution context whose runtime variables propagate from each node to the next.

See [Architecture.md](./Architecture.md), [ADR-0005](../../../../../docs/adr/0005-workflow-engine-design.md), [ADR-0008](../../../../../docs/adr/0008-workflow-execution-context.md), and [Phase 12](../../../../../docs/PHASE_12.md).

## Public API

- `WorkflowService` — the orchestrator. Construct it with a `PersistenceService` and a `WorkflowServiceDeps` (`executeRequest`, `evaluate`) supplied by the composition root.
  - `list(projectId)` — workflow summaries (with `nodeCount`), ordered by name.
  - `get(id)` — a `WorkflowDetail` including the full graph.
  - `create(input)` — a new workflow seeded with a single start node.
  - `save(input)` — persists name/description/graph.
  - `delete(id)` — removes the workflow.
  - `exportWorkflow(id)` — a self-contained `WorkflowExport`: the workflow plus every sub-workflow it references transitively, each with its full graph (request nodes keep their complete config, not a reference). Credential-store secrets are not inlined; `credentialId` references travel as-is.
  - `importWorkflow({ projectId, data })` — recreates the bundle in a project with fresh ids, remapping sub-workflow links to the new ids; returns the new root workflow.
  - `run(request, control?, requestInput?)` — loads the workflow and executes it through the engine; returns a `WorkflowRunResult`. Cancellable/pausable via the `RunController`; `requestInput` (optional) suspends the run at user-input nodes.
- `WorkflowEngine` — the deterministic, headless runtime. Construct it with `WorkflowEnginePorts` (`executeRequest`, `evaluate`, `loadWorkflow`, optional `now`/`sleep`). `run(workflow, options)` returns the ordered per-node results and final variables. **Determinism is the acceptance feature.**
- `validateGraph(graph)` — pure structural validation (single start, no branching, acyclic); throws `WorkflowError`.

## Node kinds

| Kind | Behaviour |
| --- | --- |
| `start` | Entry point. Exactly one per workflow. |
| `request` | Executes an HTTP request through the Phase 10 engine, with variables/auth resolved. |
| `set-variable` | Evaluates a `{{ template }}` and writes a runtime variable that later nodes can read. |
| `delay` | Waits a fixed number of milliseconds. |
| `sub-workflow` | Runs another workflow as a reusable component; its final variables merge back. Cycle-guarded. |
| `user-input` | Suspends the run and prompts the user for values; the submitted values are written to runtime variables. With no fields it is a Continue/Cancel checkpoint. |
| `end` | Terminates the run successfully. |

Mapping arrived in **Phase 15**: request nodes carry an `extract` list (response body/header/status → runtime variable via JSONPath/JMESPath/regex), and a **transform** node computes a variable from context (template or path/regex over a resolved input). Extraction logic is a shared, total module (`shared/extract.ts`) used by both the engine and the designer's live preview. See [Phase 15](../../../../../docs/PHASE_15.md).

Control flow arrived in **Phase 14**: **condition** (true/false), **switch** (cases + default), and **loop** (times/while) nodes route along labelled edges; any node may carry a `NodePolicy` (retries, timeout, `onError` fail/continue/route); and runs support cancellation plus in-memory pause/resume via a `RunController` (IPC `workflow.pause`/`workflow.resume`/`workflow.cancel`). `validateGraph` permits branching from branch nodes and loop cycles; termination is bounded by per-loop caps and a global step limit. See [Phase 14](../../../../../docs/PHASE_14.md).

Interactive pauses: a **user-input** node suspends the run mid-flight via the optional `requestInput` engine port. The IPC layer implements that port by pushing a `workflow.awaitingInput` event to the renderer and blocking until the renderer replies on `workflow.provideInput` (or the run is cancelled). The engine stays deterministic and headless — with no `requestInput` port (tests / headless runs) the node falls back to each field's evaluated default.

## Usage

```ts
const workflows = new WorkflowService(persistence, {
  executeRequest: (config, ctx, signal) => execution.run({ ...config, variableContext: ctx }, signal),
  evaluate: (template, ctx) => variables.evaluate({ template, context: ctx }),
});

const wf = workflows.create({ projectId, name: 'Login then fetch' });
// ... designer edits and saves the graph ...
const result = await workflows.run({ workflowId: wf.id, runtime: { user: 'demo' } });
```

## Persistence

Workflows live in the `workflows` table (migration `0009-workflows`): `project_id`, `name`, `description` (nullable), the serialized `graph` JSON, and timestamps. Access goes through `WorkflowRepository`, exposed as `persistence.workflows`. Run results are returned live and are not persisted in Phase 12.

## IPC

Wired to the renderer through `workflow.list`, `workflow.get`, `workflow.create`, `workflow.save`, `workflow.delete`, `workflow.export`/`workflow.import`, `workflow.run`, `workflow.cancel`/`pause`/`resume`, and `workflow.provideInput` (with the `workflow.awaitingInput` push event). The renderer's **Workflows** page hosts a React Flow designer (palette, canvas, node inspector) and a run panel showing per-node results and final variables, plus a modal prompt when a run suspends at a user-input node. Each workflow row offers an **Export** action (downloads the bundle JSON) and the list has an **Import workflow** button (reads a bundle JSON and recreates it in the active project).

## Designer (Phase 13)

The renderer designer adds full editing affordances over the canvas: undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`), a clipboard (`Ctrl+C/X/V`, duplicate `Ctrl+D`), and node grouping (`Ctrl+G` / `Ctrl+Shift+G`), plus a canvas toolbar and a minimap. Grouping is **view-layer metadata** only: the domain graph carries an optional `groups: { id, name, childIds }[]` that the runtime ignores (it reads only `nodes`/`edges`), so determinism is unaffected (ADR-0005). The history, clipboard, and grouping logic live in pure modules (`history.ts`, `selection-clone.ts`, `grouping.ts`) in the renderer feature, unit-tested without React. See [Phase 13](../../../../../docs/PHASE_13.md).
