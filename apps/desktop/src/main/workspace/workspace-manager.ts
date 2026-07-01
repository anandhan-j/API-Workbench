import type { Workspace, Project, CreateWorkspaceInput } from '@shared/persistence';
import type {
  ActiveSelection,
  RecentProject,
  WorkspaceDetail,
  WorkspaceExport,
} from '@shared/workspace';
import { WorkspaceExport as WorkspaceExportSchema, WORKSPACE_EXPORT_FORMAT } from '@shared/workspace';
import type { PersistenceService } from '../persistence';

const PREF_ACTIVE_WORKSPACE = 'active.workspaceId';
const PREF_ACTIVE_PROJECT = 'active.projectId';
const PREF_RECENT_PROJECTS = 'recent.projects';
const RECENT_LIMIT = 20;

export interface WorkspaceManagerOptions {
  appVersion?: string;
}

/**
 * Application service for workspace management (Phase 3).
 *
 * Sits on top of the persistence repositories and adds the user-facing concepts:
 * the active workspace/project, recently opened projects, per-workspace settings,
 * and portable import/export. Multi-write operations run in a single transaction
 * so state stays consistent, and the active selection self-heals if it points at
 * something that no longer exists — which is what keeps multiple workspaces
 * independent of one another.
 *
 * "Clearing" the active workspace/project deletes the preference key rather than
 * storing null, because preference values are NOT NULL.
 */
export class WorkspaceManager {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly options: WorkspaceManagerOptions = {},
  ) {}

  // --- Workspaces ---

  listWorkspaces(): Workspace[] {
    return this.persistence.workspaces.list();
  }

  createWorkspace(input: CreateWorkspaceInput): Workspace {
    return this.persistence.workspaces.create(input);
  }

  renameWorkspace(id: string, name: string): Workspace {
    return this.persistence.workspaces.rename(id, name);
  }

  updateWorkspaceSettings(id: string, settings: Record<string, unknown>): Workspace {
    return this.persistence.workspaces.update(id, { settings });
  }

  getWorkspaceDetail(id: string): WorkspaceDetail {
    return {
      workspace: this.persistence.workspaces.get(id),
      projects: this.persistence.projects.listByWorkspace(id),
    };
  }

  deleteWorkspace(id: string): void {
    this.persistence.workspaces.get(id); // throws NotFoundError if absent
    this.persistence.transaction(() => {
      // Purge scoped variables/credentials BEFORE the cascade removes the
      // descendants they are enumerated from (they have no FK to cascade through).
      this.persistence.scopedData.workspace(id);
      this.persistence.workspaces.delete(id); // cascades projects
      if (this.persistence.preferences.get(PREF_ACTIVE_WORKSPACE) === id) {
        this.persistence.preferences.delete(PREF_ACTIVE_WORKSPACE);
        this.persistence.preferences.delete(PREF_ACTIVE_PROJECT);
      }
      const kept = this.readRecents().filter((r) => r.workspaceId !== id);
      this.persistence.preferences.set(PREF_RECENT_PROJECTS, kept);
    });
  }

  // --- Projects ---

  createProject(input: { workspaceId: string; name: string }): Project {
    this.persistence.workspaces.get(input.workspaceId); // validate parent
    return this.persistence.projects.create(input);
  }

  renameProject(id: string, name: string): Project {
    return this.persistence.projects.rename(id, name);
  }

  listProjects(workspaceId: string): Project[] {
    return this.persistence.projects.listByWorkspace(workspaceId);
  }

  deleteProject(id: string): void {
    this.persistence.projects.get(id);
    this.persistence.transaction(() => {
      this.persistence.scopedData.project(id); // purge scoped data before cascade
      this.persistence.projects.delete(id);
      if (this.persistence.preferences.get(PREF_ACTIVE_PROJECT) === id) {
        this.persistence.preferences.delete(PREF_ACTIVE_PROJECT);
      }
      const kept = this.readRecents().filter((r) => r.projectId !== id);
      this.persistence.preferences.set(PREF_RECENT_PROJECTS, kept);
    });
  }

  // --- Active selection ---

  setActiveWorkspace(id: string): void {
    this.persistence.workspaces.get(id);
    this.persistence.transaction(() => {
      this.persistence.preferences.set(PREF_ACTIVE_WORKSPACE, id);
      const activeProject = this.persistence.preferences.get<string>(PREF_ACTIVE_PROJECT);
      if (activeProject) {
        const project = this.persistence.projects.findById(activeProject);
        if (!project || project.workspaceId !== id) {
          this.persistence.preferences.delete(PREF_ACTIVE_PROJECT);
        }
      }
    });
  }

  openProject(id: string, now: number = Date.now()): void {
    const project = this.persistence.projects.get(id);
    this.persistence.transaction(() => {
      this.persistence.preferences.set(PREF_ACTIVE_WORKSPACE, project.workspaceId);
      this.persistence.preferences.set(PREF_ACTIVE_PROJECT, project.id);
      const recents = this.readRecents().filter((r) => r.projectId !== project.id);
      const next: RecentProject[] = [
        { projectId: project.id, workspaceId: project.workspaceId, name: project.name, openedAt: now },
        ...recents,
      ].slice(0, RECENT_LIMIT);
      this.persistence.preferences.set(PREF_RECENT_PROJECTS, next);
    });
  }

  closeProject(): void {
    this.persistence.preferences.delete(PREF_ACTIVE_PROJECT);
  }

  /** Returns the active selection, self-healing references to deleted entities. */
  getActiveSelection(): ActiveSelection {
    let workspaceId = (this.persistence.preferences.get<string>(PREF_ACTIVE_WORKSPACE) ?? null) as
      | string
      | null;
    let projectId = (this.persistence.preferences.get<string>(PREF_ACTIVE_PROJECT) ?? null) as
      | string
      | null;

    if (workspaceId && !this.persistence.workspaces.findById(workspaceId)) workspaceId = null;
    if (projectId) {
      const project = this.persistence.projects.findById(projectId);
      if (!project || (workspaceId && project.workspaceId !== workspaceId)) projectId = null;
    }
    return { workspaceId, projectId };
  }

  // --- Recent projects ---

  listRecentProjects(limit: number = RECENT_LIMIT): RecentProject[] {
    const all = this.readRecents();
    const valid = all.filter((r) => this.persistence.projects.findById(r.projectId));
    if (valid.length !== all.length) {
      this.persistence.preferences.set(PREF_RECENT_PROJECTS, valid);
    }
    return valid.slice(0, limit);
  }

  private readRecents(): RecentProject[] {
    const raw = this.persistence.preferences.getOrDefault<RecentProject[]>(PREF_RECENT_PROJECTS, []);
    return Array.isArray(raw) ? raw : [];
  }

  // --- Import / export ---

  exportWorkspace(id: string, now: number = Date.now()): WorkspaceExport {
    const workspace = this.persistence.workspaces.get(id);
    const projects = this.persistence.projects.listByWorkspace(id);
    return {
      formatVersion: WORKSPACE_EXPORT_FORMAT,
      exportedAt: now,
      ...(this.options.appVersion ? { appVersion: this.options.appVersion } : {}),
      workspace: { name: workspace.name, settings: workspace.settings },
      projects: projects.map((p) => ({ name: p.name })),
    };
  }

  /** Imports an exported workspace as a brand-new workspace (fresh ids). */
  importWorkspace(data: unknown): Workspace {
    const parsed = WorkspaceExportSchema.parse(data);
    return this.persistence.transaction(() => {
      const workspace = this.persistence.workspaces.create({
        name: parsed.workspace.name,
        settings: parsed.workspace.settings,
      });
      for (const project of parsed.projects) {
        this.persistence.projects.create({ workspaceId: workspace.id, name: project.name });
      }
      return workspace;
    });
  }
}
