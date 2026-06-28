# Workspace Module

The application-layer service for workspace management (Phase 3). It sits above the [persistence layer](../persistence/README.md) and adds the user-facing concepts: the active workspace and project, recently opened projects, per-workspace settings, and portable import/export.

See [Architecture.md](./Architecture.md) for the design and [Phase 3](../../../../../docs/PHASE_3.md) for the milestone.

## Public API

`WorkspaceManager` — construct it with a `PersistenceService` and optional `{ appVersion }`:

- Workspaces: `listWorkspaces`, `createWorkspace`, `renameWorkspace`, `updateWorkspaceSettings`, `getWorkspaceDetail`, `deleteWorkspace`.
- Projects: `createProject`, `listProjects`, `deleteProject`.
- Active selection: `setActiveWorkspace`, `openProject`, `closeProject`, `getActiveSelection` (self-healing).
- Recents: `listRecentProjects`.
- Import/export: `exportWorkspace`, `importWorkspace`.

## Usage

```ts
const manager = new WorkspaceManager(persistence, { appVersion: app.getVersion() });

const ws = manager.createWorkspace({ name: 'My Workspace' });
const project = manager.createProject({ workspaceId: ws.id, name: 'API' });
manager.openProject(project.id); // sets active workspace + project, records a recent

const data = manager.exportWorkspace(ws.id);   // portable JSON
const copy = manager.importWorkspace(data);    // independent new workspace
```

## Behaviour notes

The active workspace/project are stored as preferences and **cleared by deleting the key** (preference values are NOT NULL). `getActiveSelection` self-heals: if the stored active workspace or project no longer exists, it reports `null` rather than a dangling id. Multi-write operations (open, delete, import) run inside a single persistence transaction. Import always creates a brand-new workspace with fresh ids, so imported and original workspaces are fully independent.

## Renderer surface

The renderer consumes these operations through the typed IPC contract via the React Query hooks in `renderer/src/features/workspaces/use-workspaces.ts`, rendered by `WorkspacesPage.tsx`.
