# Workspace — Architecture

This module is the application-service layer for Phase 3. It contains no data access of its own: it orchestrates the persistence repositories to express workspace-level use cases, keeping the policy (what "open a project" means) separate from the mechanism (rows in SQLite). This is the clean-architecture seam between the application and infrastructure layers described in the [Architecture Overview](../../../../../docs/architecture/ARCHITECTURE.md).

## Responsibilities

`WorkspaceManager` owns four concerns that the raw repositories deliberately do not:

The **active selection** — which workspace and project the user currently has open. This is persisted as two preference keys and exposed through `getActiveSelection`, which *self-heals*: a stored reference to a deleted workspace or project is reported as `null` instead of a dangling id. Clearing the selection deletes the preference key rather than writing `null`, because preference values are NOT NULL.

**Recently opened projects** — a capped, de-duplicated, most-recent-first list stored as a preference. Opening a project moves it to the front; `listRecentProjects` prunes entries whose project no longer exists and persists the pruned list, so the recents never reference deleted data.

**Per-workspace settings** — read and written through the workspace row's JSON `settings` column via `updateWorkspaceSettings`.

**Import/export** — `exportWorkspace` produces a versioned, portable `WorkspaceExport` (format version, timestamp, workspace name + settings, project names). `importWorkspace` validates the payload with Zod and creates a brand-new workspace with fresh ids, so an imported workspace is fully independent of its source.

## Transactions and independence

Every operation that performs more than one write — open project (active workspace + active project + recents), delete workspace (cascade + clear active + prune recents), delete project, import (workspace + N projects) — runs inside a single persistence transaction, so a failure leaves no partial state. Combined with the cascading foreign key from projects to workspaces and the self-healing active selection, this is what guarantees the Phase 3 acceptance criterion: **multiple workspaces function independently**, and operations on one never corrupt another.

## Testability

The manager depends only on `PersistenceService`, so it inherits the layer's driver independence: its tests run against the sql.js-backed connection with no native build. The eight-case suite exercises workspace independence, the active-selection lifecycle and self-healing, recents de-duplication and pruning, settings, and the export/import round-trip including that an imported copy can be deleted without affecting the original.

## Boundary

The module imports no Electron API; the composition root in `main/index.ts` constructs it and the IPC layer (`main/ipc`) exposes its methods as validated channels. The renderer never calls it directly — it goes through the typed contract — keeping the dependency direction intact.
