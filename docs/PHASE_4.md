# Phase 4 — Collection Management

This document records what the Phase 4 milestone delivers, the decisions taken, and its acceptance status. Phase 4 adds the collection explorer — the core structure developers organize their API requests in.

## Delivered

A `CollectionExplorer` application service under `apps/desktop/src/main/collections`, the persistence to back it, and the renderer explorer that consumes it.

The data layer adds four tables via migration `0002` — collections, folders (self-nesting), requests, and request history — with cascading foreign keys and indexes on the columns the explorer queries. Four repositories provide their CRUD, ordering, favorites, and search. The `CollectionExplorer` service composes them into the explorer use cases: collections, nested folders, requests with move/copy/rename/delete, favorites, recently opened history, a project- or collection-scoped search, and a flat depth-annotated tree for rendering. Folder moves are guarded against cycles and cross-collection moves.

The full surface is exposed to the renderer through new typed IPC channels (`collection.*`, `folder.*`, `request.*`), registered in the main process and composed in the bootstrap. On the renderer, a Collections screen renders the tree with `react-window` virtualization, a live search box, favorite toggles, and create/delete actions, backed by React Query hooks. A sidebar entry and route were added.

## Key decisions

**Flat, depth-annotated tree.** The service returns the collection as a flat ordered list of nodes rather than a nested structure. This maps directly onto row virtualization, so the renderer mounts only visible rows — the mechanism behind the responsiveness target.

**Cascading deletes in the schema, not the service.** Removing a collection, folder, or project relies on foreign-key cascade rather than application-level recursion, which is simpler and atomic.

**Driver-agnostic, verified against sql.js.** As with earlier phases, only the production connection touches the native driver, so the entire explorer — including a 10,000-request scale test — runs in the sandbox against pure-WASM SQLite.

## Tests and verification

Ten new tests: nine for the `CollectionExplorer` (tree depth/order, request and folder moves with cross-collection and cycle prevention, copy, favorites, multi-field search, history record/dedupe/clear, and cascade deletes) plus a **10,000-request scale test** asserting that tree construction and search complete well within generous time bounds; and three React Testing Library tests for the virtualized `CollectionTree` (empty state, rendering folders/requests with method badges, and open/favorite callbacks). Together with the prior phases the suite is **65 tests across 14 files, all passing**, and the renderer/shared and service TypeScript projects type-check cleanly. The Phase 2 migrator and backup tests were updated to be agnostic to the migration count now that a second migration exists.

As before, the headless sandbox verifies typecheck and tests but cannot launch Electron or compile the native driver; the live application runs on a developer workstation per [Getting Started](./guides/GETTING_STARTED.md).

## Acceptance criteria

Phase 4 requires that 10,000+ requests remain responsive. The data layer is verified against exactly that: with 10,000 requests the flat-tree build and an indexed search both complete in a small fraction of the allotted bounds, and the renderer virtualizes the resulting list so only visible rows are mounted. The deliverable — a complete collection explorer (collections, folders, requests, move, copy, rename, delete, favorites, history, search, and a virtualized tree) — is present across the service, IPC, and UI.

## Next

Phase 5 (OpenAPI Import Engine) parses OpenAPI 3.x / Swagger 2 documents and generates collections, folders, and requests into this structure. See the [Roadmap](./ROADMAP.md).
