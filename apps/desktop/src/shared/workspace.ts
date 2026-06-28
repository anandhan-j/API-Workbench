import { z } from 'zod';
import { Workspace, Project } from './persistence';

/**
 * Transport DTOs for workspace management (Phase 3). Built on the persistence
 * DTOs and shared by the main-process WorkspaceManager and the renderer.
 */

/** Which workspace/project the user currently has active (either may be null). */
export const ActiveSelection = z.object({
  workspaceId: z.string().nullable(),
  projectId: z.string().nullable(),
});
export type ActiveSelection = z.infer<typeof ActiveSelection>;

/** A recently opened project, most-recent first when listed. */
export const RecentProject = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  openedAt: z.number(),
});
export type RecentProject = z.infer<typeof RecentProject>;

/** A workspace together with its projects — the detail view payload. */
export const WorkspaceDetail = z.object({
  workspace: Workspace,
  projects: z.array(Project),
});
export type WorkspaceDetail = z.infer<typeof WorkspaceDetail>;

/** Portable, versioned representation of a workspace and its projects. */
export const WORKSPACE_EXPORT_FORMAT = 1;
export const WorkspaceExport = z.object({
  formatVersion: z.literal(WORKSPACE_EXPORT_FORMAT),
  exportedAt: z.number(),
  appVersion: z.string().optional(),
  workspace: z.object({
    name: z.string().min(1),
    settings: z.record(z.unknown()),
  }),
  projects: z.array(z.object({ name: z.string().min(1) })),
});
export type WorkspaceExport = z.infer<typeof WorkspaceExport>;
