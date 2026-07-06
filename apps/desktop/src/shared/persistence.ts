import { z } from 'zod';

/**
 * Transport DTOs for the persistence layer. Shared by the main-process
 * repositories and the renderer over IPC so both sides agree on shape.
 */

export const Workspace = z.object({
  id: z.string(),
  name: z.string().min(1),
  settings: z.record(z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Workspace = z.infer<typeof Workspace>;

export const Project = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.infer<typeof Project>;

export const Preference = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  updatedAt: z.number(),
});
export type Preference = z.infer<typeof Preference>;

/**
 * Preference key: validate TLS server certificates for outbound HTTP requests.
 * Defaults to `true`; setting it to `false` accepts self-signed / invalid
 * certificates (the "SSL certificate verification" toggle). Shared so the main
 * transport and the renderer settings UI agree on the key.
 */
export const PREF_VERIFY_SSL = 'network.verifySsl';

export const BackupInfo = z.object({
  id: z.string(),
  fileName: z.string(),
  createdAt: z.number(),
  sizeBytes: z.number(),
  checksum: z.string(),
  schemaVersion: z.number(),
  appVersion: z.string().optional(),
});
export type BackupInfo = z.infer<typeof BackupInfo>;

/** Input payloads. */
export const CreateWorkspaceInput = z.object({
  name: z.string().min(1),
  settings: z.record(z.unknown()).optional(),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInput>;

export const CreateProjectInput = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;
