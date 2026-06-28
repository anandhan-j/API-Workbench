# Phase 3 — Workspace Management

This document records what the Phase 3 milestone delivers, the decisions taken, and its acceptance status. Phase 3 turns the raw persistence layer into the user-facing workspace and project experience.

## Delivered

A `WorkspaceManager` application service under `apps/desktop/src/main/workspace`, built on the Phase 2 persistence layer, plus the renderer UI that consumes it.

The manager provides workspaces (create, rename, settings, delete with cascade), projects within a workspace (create, list, delete), the active workspace/project selection with open and close, a capped most-recent-projects list, and portable import/export of a workspace and its projects. The active selection self-heals references to deleted entities, and every multi-write operation runs in a single transaction. The full surface is exposed to the renderer through new typed IPC channels (`workspace.*`, `project.*`) registered in the main process and composed in the bootstrap.

On the renderer, a Workspaces screen (`features/workspaces/WorkspacesPage.tsx`) backed by React Query hooks lets the user create and switch workspaces, manage and open projects, see recent projects, and export/import a workspace as a JSON file. A sidebar entry and route were added.

## Key decisions

**Application service over the repositories.** Workspace-level concepts (active selection, recents, import/export) are policy, not storage, so they live in an application service that orchestrates the repositories rather than being pushed into the data layer. This keeps the persistence layer generic and the workspace rules in one testable place.

**Clear-by-delete for the active selection.** Preference values are `NOT NULL`, so "no active project" is represented by the absence of the key, not a stored null. `getActiveSelection` self-heals dangling references, which is what makes deleting one workspace safe for the active state of others.

**Import creates fresh ids.** Importing always produces a new workspace with new ids rather than restoring originals, avoiding id collisions and guaranteeing the imported and source workspaces are independent.

## Tests and verification

Ten new tests: eight for the `WorkspaceManager` (independence of multiple workspaces, the active-selection lifecycle and self-healing, recents de-duplication and pruning, settings, export/import round-trip including independent deletion, and invalid-import rejection) run against the sql.js connection; two React Testing Library tests cover the Workspaces page (the no-bridge state, and the create-workspace → activate → add-project flow against an in-memory fake bridge). Together with the prior phases the suite is **53 tests across 12 files, all passing**, and the renderer/shared and service TypeScript projects type-check cleanly.

As before, the headless sandbox verifies typecheck and tests but cannot launch Electron or compile the native driver; the live application is run on a developer workstation per [Getting Started](./guides/GETTING_STARTED.md).

## Acceptance criteria

Phase 3 requires that multiple workspaces function independently. This is demonstrated directly: creating two workspaces with their own projects keeps their project lists isolated; deleting one leaves the other and its projects intact; the active selection self-heals when its target is removed; and an imported workspace can be modified or deleted without affecting the original. The deliverable — a Workspace Manager — is present as the service plus its renderer surface.

## Next

Phase 4 (Collection Management) introduces collections, folders, and requests with a virtualized, searchable explorer on top of this workspace/project structure. See the [Roadmap](./ROADMAP.md).
