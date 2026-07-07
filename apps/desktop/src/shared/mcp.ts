import { z } from 'zod';

/**
 * DTOs for the app-managed MCP server (the bundled `@api-workbench/workflow-mcp`
 * run as a child process in Streamable HTTP mode). The renderer shows the URL
 * with a copy button; the main process owns the child's lifecycle.
 */

export const McpRunState = z.enum(['stopped', 'starting', 'running', 'error']);
export type McpRunState = z.infer<typeof McpRunState>;

export const McpStatus = z.object({
  state: McpRunState,
  /** The full connect URL (includes the `?token=`) while running, else null. */
  url: z.string().nullable(),
  /** The actually-bound port while running, else the configured port (0 = auto). */
  port: z.number().int(),
  /** The configured port preference (0 = auto-assign). */
  configuredPort: z.number().int(),
  /** The configured HTTPS/TLS preference. */
  configuredTls: z.boolean(),
  /** Whether the running server is served over HTTPS. */
  secure: z.boolean(),
  /** Human-readable error from the last failed start/crash, else null. */
  error: z.string().nullable(),
});
export type McpStatus = z.infer<typeof McpStatus>;
