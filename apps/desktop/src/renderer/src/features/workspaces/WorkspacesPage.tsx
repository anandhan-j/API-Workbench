import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Download, FolderOpen, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import type { WorkspaceExport } from '@shared/workspace';
import { cn } from '../../lib/cn';
import { isBridgeAvailable } from '../../lib/ipc';
import { useConfirm } from '../../components/confirm/ConfirmProvider';
import {
  useActiveSelection,
  useRecentProjects,
  useWorkspaceDetail,
  useWorkspaceMutations,
  useWorkspaces,
} from './use-workspaces';

export function WorkspacesPage(): JSX.Element {
  const bridge = isBridgeAvailable();
  const workspaces = useWorkspaces();
  const active = useActiveSelection();
  const recents = useRecentProjects();
  const mutations = useWorkspaceMutations();
  const confirm = useConfirm();

  const confirmDeleteWorkspace = async (id: string, name: string): Promise<void> => {
    if (
      await confirm({
        title: 'Delete workspace',
        message: `Delete workspace "${name}"? Every project inside it — along with all their collections, requests, workflows, and variables — will be permanently deleted. This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      })
    ) {
      mutations.deleteWorkspace.mutate(id);
    }
  };

  const confirmDeleteProject = async (id: string, name: string): Promise<void> => {
    if (
      await confirm({
        title: 'Delete project',
        message: `Delete project "${name}"? All of its collections, requests, workflows, and variables will be permanently deleted. This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      })
    ) {
      mutations.deleteProject.mutate(id);
    }
  };

  const activeWorkspaceId = active.data?.workspaceId ?? null;
  const detail = useWorkspaceDetail(activeWorkspaceId);
  const navigate = useNavigate();

  /** Open a project's collections: activate its workspace, open it, go to Collections. */
  const openCollections = (projectId: string, workspaceId?: string): void => {
    if (workspaceId && workspaceId !== activeWorkspaceId) {
      mutations.setActiveWorkspace.mutate(workspaceId);
    }
    mutations.openProject.mutate(projectId);
    navigate('/collections');
  };

  const [newWorkspace, setNewWorkspace] = useState('');
  const [newProject, setNewProject] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  /** Inline rename state: which entity (by kind + id) is being edited and its draft name. */
  const [editing, setEditing] = useState<{
    kind: 'workspace' | 'project';
    id: string;
    name: string;
  } | null>(null);

  const startEditing = (kind: 'workspace' | 'project', id: string, name: string): void =>
    setEditing({ kind, id, name });

  const commitEditing = (originalName: string): void => {
    if (!editing) return;
    const name = editing.name.trim();
    if (name && name !== originalName) {
      const mutation =
        editing.kind === 'workspace' ? mutations.renameWorkspace : mutations.renameProject;
      mutation.mutate({ id: editing.id, name });
    }
    setEditing(null);
  };

  const renameInput = (originalName: string): JSX.Element => (
    <input
      autoFocus
      value={editing?.name ?? ''}
      aria-label={`Rename ${originalName}`}
      onChange={(e) => setEditing((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
      onBlur={() => commitEditing(originalName)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitEditing(originalName);
        else if (e.key === 'Escape') setEditing(null);
      }}
      className="min-w-0 flex-1 rounded-sm border border-accent bg-bg px-1 py-0.5 text-sm"
    />
  );

  if (!bridge) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <p className="mt-2 text-muted">
          Workspace management requires the desktop database, which is only available when running
          inside the application.
        </p>
      </div>
    );
  }

  const handleExport = async (id: string): Promise<void> => {
    const data = await mutations.exportWorkspace.mutateAsync(id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.workspace.name}-workspace.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File): Promise<void> => {
    const text = await file.text();
    const data = JSON.parse(text) as WorkspaceExport;
    await mutations.importWorkspace.mutateAsync(data);
  };

  return (
    <div className="grid w-full grid-cols-1 gap-6 p-8 lg:grid-cols-[20rem_1fr]">
      <section aria-label="Workspaces">
        <h1 className="text-xl font-semibold">Workspaces</h1>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newWorkspace.trim()) return;
            mutations.createWorkspace.mutate({ name: newWorkspace.trim() });
            setNewWorkspace('');
          }}
        >
          <input
            value={newWorkspace}
            onChange={(e) => setNewWorkspace(e.target.value)}
            placeholder="New workspace name"
            aria-label="New workspace name"
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            aria-label="Create workspace"
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg"
          >
            <Plus size={15} /> Add
          </button>
        </form>

        <ul className="mt-4 space-y-1">
          {workspaces.data?.map((ws) => (
            <li
              key={ws.id}
              className={cn(
                'group flex items-center justify-between rounded-md border border-transparent px-3 py-2 text-sm hover:bg-surface-2',
                ws.id === activeWorkspaceId && 'border-border bg-surface-2',
              )}
            >
              {editing?.kind === 'workspace' && editing.id === ws.id ? (
                <>
                  <span className="w-[15px]" />
                  {renameInput(ws.name)}
                </>
              ) : (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => mutations.setActiveWorkspace.mutate(ws.id)}
                  onDoubleClick={() => startEditing('workspace', ws.id, ws.name)}
                >
                  {ws.id === activeWorkspaceId ? (
                    <Check size={15} className="shrink-0 text-success" />
                  ) : (
                    <span className="w-[15px]" />
                  )}
                  <span className="truncate">{ws.name}</span>
                </button>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Rename ${ws.name}`}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => startEditing('workspace', ws.id, ws.name)}
                >
                  <Pencil size={14} className="text-muted hover:text-accent" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${ws.name}`}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => void confirmDeleteWorkspace(ws.id, ws.name)}
                >
                  <Trash2 size={15} className="text-muted hover:text-danger" />
                </button>
              </div>
            </li>
          ))}
          {workspaces.data?.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No workspaces yet.</li>
          )}
        </ul>
      </section>

      <section aria-label="Active workspace" className="min-w-0">
        {activeWorkspaceId && detail.data ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="truncate text-lg font-semibold">{detail.data.workspace.name}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleExport(activeWorkspaceId)}
                  className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2"
                >
                  <Download size={14} /> Export
                </button>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2"
                >
                  <Upload size={14} /> Import
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  aria-label="Import workspace file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newProject.trim()) return;
                mutations.createProject.mutate({ workspaceId: activeWorkspaceId, name: newProject.trim() });
                setNewProject('');
              }}
            >
              <input
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                placeholder="New project name"
                aria-label="New project name"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              />
              <button
                type="submit"
                className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg"
              >
                <Plus size={15} /> Project
              </button>
            </form>

            <ul className="mt-4 space-y-1">
              {detail.data.projects.map((project) => (
                <li
                  key={project.id}
                  className={cn(
                    'group flex items-center justify-between rounded-md border border-transparent px-3 py-2 text-sm hover:bg-surface-2',
                    project.id === active.data?.projectId && 'border-border bg-surface-2',
                  )}
                >
                  {editing?.kind === 'project' && editing.id === project.id ? (
                    <>
                      <span className="w-[15px]" />
                      {renameInput(project.name)}
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Select ${project.name}`}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => mutations.openProject.mutate(project.id)}
                      onDoubleClick={() => startEditing('project', project.id, project.name)}
                    >
                      {project.id === active.data?.projectId ? (
                        <Check size={15} className="shrink-0 text-success" />
                      ) : (
                        <span className="w-[15px]" />
                      )}
                      <span className="truncate">{project.name}</span>
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Open collections for ${project.name}`}
                      onClick={() => openCollections(project.id, activeWorkspaceId ?? undefined)}
                      className="flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <FolderOpen size={14} /> Open collections
                    </button>
                    <button
                      type="button"
                      aria-label={`Rename ${project.name}`}
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => startEditing('project', project.id, project.name)}
                    >
                      <Pencil size={14} className="text-muted hover:text-accent" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${project.name}`}
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => void confirmDeleteProject(project.id, project.name)}
                    >
                      <Trash2 size={14} className="text-muted hover:text-danger" />
                    </button>
                  </div>
                </li>
              ))}
              {detail.data.projects.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted">No projects in this workspace.</li>
              )}
            </ul>

            <h3 className="mt-8 text-sm font-semibold text-muted">Recent projects</h3>
            <ul className="mt-2 space-y-1">
              {recents.data?.map((r) => (
                <li key={r.projectId} className="flex items-center justify-between text-sm">
                  <span className="truncate text-muted">{r.name}</span>
                  <button
                    type="button"
                    onClick={() => openCollections(r.projectId)}
                    className="text-xs text-accent hover:underline"
                  >
                    Open collections
                  </button>
                </li>
              ))}
              {recents.data?.length === 0 && (
                <li className="text-sm text-muted">Nothing opened yet.</li>
              )}
            </ul>
          </>
        ) : activeWorkspaceId && detail.isLoading ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-muted">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Loading workspace…</p>
          </div>
        ) : (
          <p className="text-muted">Select or create a workspace to get started.</p>
        )}
      </section>
    </div>
  );
}
