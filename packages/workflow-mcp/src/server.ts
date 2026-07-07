import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

/** Kept in sync with package.json version by the release process. */
export const SERVER_NAME = 'workflow-mcp';
export const SERVER_VERSION = '0.1.0';

/**
 * Builds a fully-registered MCP server. Transport-agnostic: the same server is
 * connected to a stdio or Streamable HTTP transport by the entrypoint. A fresh
 * instance is created per HTTP session.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerResources(server);
  registerTools(server);
  registerPrompts(server);
  return server;
}
