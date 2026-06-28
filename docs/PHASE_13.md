# Phase 13 — Visual Workflow Designer

This document records what the Phase 13 milestone delivers, the decisions taken, and its acceptance status. Phase 13 completes the workflow designer: the React Flow canvas introduced in Phase 12 gains the editing affordances needed to build and maintain complex workflows comfortably.

## Context

The canvas itself — React Flow surface, drag-and-drop from a node palette, pan, zoom, minimap, and selection — was delivered early as part of Phase 12. Phase 13 therefore focuses on the remaining designer capabilities: **undo/redo**, a **clipboard** (copy/cut/paste/duplicate), **node grouping**, and **performance hardening** for large graphs. All of it stays on the renderer side of ADR-0005: the canvas edits the domain graph and never carries execution semantics.

## Delivered

**Undo/redo.** A pure history core (`history.ts`) maintains past/present/future snapshots of the canvas (nodes + edges) with a bounded undo stack. The canvas commits a snapshot on discrete actions — adding, connecting, deleting, grouping, pasting, and editing a node — and on drag *end*, while intermediate drag frames update the present without polluting history (a drag is one undoable step, captured from its pre-drag state). `Ctrl+Z` undoes and `Ctrl+Shift+Z` / `Ctrl+Y` redoes; a new action clears the redo branch.

**Clipboard.** A pure clone core (`selection-clone.ts`) copies the selected element nodes plus their internal edges (edges whose endpoints are both selected), assigning fresh ids, offsetting positions, and clearing any run status. The start node is never copied. `Ctrl+C` / `Ctrl+X` / `Ctrl+V` copy/cut/paste and `Ctrl+D` duplicates; pasted nodes arrive selected and offset from the originals.

**Grouping.** Selected nodes can be boxed into a labelled group (`Ctrl+G`) that moves together, and dissolved again (`Ctrl+Shift+G`). Grouping is **view-layer metadata** (`grouping.ts` + the mapping helpers): the domain graph gains an optional `groups: { id, name, childIds }[]` that the runtime ignores entirely, so determinism is untouched (ADR-0005). The graph mappers convert between the domain's absolute node positions and React Flow's parent/relative-position representation losslessly, and a round-trip test guards that conversion.

**Performance.** The custom node renderers are memoized, `nodeTypes` is a stable module constant, React Flow runs with `onlyRenderVisibleElements`, and the upward graph propagation is debounced so dragging on a large workflow does not re-serialise the whole graph on every frame.

A canvas toolbar exposes undo, redo, group, and ungroup with their enabled/disabled states, complementing the keyboard shortcuts. Group nodes are non-deletable (they are removed via ungroup) so deleting never orphans children.

## Key decisions

**Groups are view-only metadata.** Rather than introduce a "group" node kind into the executable model (which would force the engine to understand and skip it), groups live in a separate `groups` array the runtime never reads. This keeps the engine's linear, deterministic model intact and lets the designer evolve grouping freely.

**Absolute positions in the domain, relative on the canvas.** The persisted graph keeps absolute node positions; React Flow's parent-node grouping needs relative positions. The mappers own that conversion in one tested place, so neither the engine nor the rest of the UI deals with relative coordinates.

**One drag = one undo step.** History is committed from the pre-drag snapshot on drag start and finalised on drag end, instead of recording every intermediate position, so undo behaves the way users expect.

**Pure cores, thin canvas.** History, cloning, and grouping are pure modules unit-tested without React or React Flow; the canvas wires them to events and keyboard shortcuts. This keeps the most error-prone logic verifiable in isolation.

## Tests and verification

Fourteen new tests cover the phase: history (commit/undo/redo, redo-branch invalidation, replace-vs-commit, stack bounding, boundary no-ops), clipboard cloning (fresh ids, internal-edge remap, start excluded, status cleared), grouping (reparenting, no-op under two nodes, group→ungroup absolute-position round-trip), and the group-aware graph mapping round-trip. With the Phase 12 suite that is 40 workflow tests in total, all passing, and the workflow sources type-check cleanly on both the node and web TypeScript projects.

## Acceptance criteria

Phase 13 requires smooth interaction with complex workflows. The designer now supports drag-and-drop, zoom, pan, grouping, selection, undo, redo, clipboard, and a minimap, with memoization, visible-only rendering, and debounced serialisation to stay responsive as graphs grow. React Flow canvas, drag-and-drop, zoom, pan, grouping, selection, undo, redo, clipboard, and the mini map are all implemented and tested.

## Next

Phase 14 adds the workflow runtime's control flow — conditions, loops, switch, retry, timeout, error handling, and pause/resume — which will introduce branching into the graph that the Phase 12 validator currently rejects. Phase 15 adds visual data mapping. See the [Roadmap](./ROADMAP.md).
