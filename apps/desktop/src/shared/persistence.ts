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

/**
 * Preference key: the TCP port the bundled MCP server listens on when started
 * from the app. `0` (the default) asks the OS for a free port. Shared so the
 * main-process manager and the renderer settings UI agree on the key.
 */
export const PREF_MCP_PORT = 'mcp.serverPort';

/**
 * Preference key: serve the app-managed MCP server over HTTPS (TLS) using a
 * self-signed certificate. Defaults to `true`. Note some MCP clients reject
 * self-signed certificates — the settings UI surfaces this and the toggle can be
 * turned off to fall back to loopback HTTP. Shared so the main-process manager
 * and the renderer settings UI agree on the key.
 */
export const PREF_MCP_TLS = 'mcp.serverTls';

/**
 * Preference key: the last auto-assigned ("sticky") MCP port. When {@link
 * PREF_MCP_PORT} is 0 (auto), the server reuses this port so its URL stays stable
 * across restarts, and re-picks a fresh free port (updating this) if it is
 * unavailable. Distinct from PREF_MCP_PORT so a user's explicit port choice is
 * never silently overwritten by an auto-assignment.
 */
export const PREF_MCP_PORT_ASSIGNED = 'mcp.serverPortAssigned';

/**
 * Preference key: the bearer token embedded in the app-managed MCP server's
 * connect URL. Persisted so the token (and therefore the URL clients configure)
 * stays **stable across restarts** — it is generated once on first run and only
 * rotated when the user explicitly refreshes it. Shared so the main-process
 * manager and the renderer settings UI agree on the key.
 */
export const PREF_MCP_TOKEN = 'mcp.serverToken';

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
