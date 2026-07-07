import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import { exampleNames, getExample, listExampleMeta } from './examples.js';
import { workflowExportSchema, workflowGraphSchema } from './schema.js';

const SCHEMA_MIME = 'application/schema+json';
const JSON_MIME = 'application/json';

/**
 * Registers the read-only resources this server exposes:
 *  - `workflow://schema`       — the export-bundle JSON Schema
 *  - `workflow://schema/graph` — the bare-graph JSON Schema
 *  - `workflow://examples/{name}` — the bundled example workflow library
 *
 * Resources are application-controlled: the host/user pulls them into context.
 * Because resource support varies by client, the schema is *also* reachable via
 * the `get_workflow_schema` tool (Phase 3).
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    'workflow-schema',
    'workflow://schema',
    {
      title: 'Workflow JSON Schema',
      description:
        'JSON Schema (draft-07) for an API Workbench .workflow.json export bundle. Author workflows to match this schema.',
      mimeType: SCHEMA_MIME,
    },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: SCHEMA_MIME, text: JSON.stringify(workflowExportSchema, null, 2) },
      ],
    }),
  );

  server.registerResource(
    'workflow-graph-schema',
    'workflow://schema/graph',
    {
      title: 'Workflow graph JSON Schema',
      description:
        'JSON Schema (draft-07) for a bare workflow graph ({ nodes, edges, groups }), without the export-bundle envelope.',
      mimeType: SCHEMA_MIME,
    },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: SCHEMA_MIME, text: JSON.stringify(workflowGraphSchema, null, 2) },
      ],
    }),
  );

  server.registerResource(
    'workflow-example',
    new ResourceTemplate('workflow://examples/{name}', {
      list: () => ({
        resources: listExampleMeta().map((meta) => ({
          uri: `workflow://examples/${meta.name}`,
          name: meta.name,
          title: meta.title,
          description: meta.description,
          mimeType: JSON_MIME,
        })),
      }),
    }),
    {
      title: 'Workflow example',
      description: 'Example .workflow.json bundles to learn the format from.',
    },
    (uri, variables) => {
      const raw = variables.name;
      const name = Array.isArray(raw) ? raw[0] : raw;
      const example = typeof name === 'string' ? getExample(name) : undefined;
      if (!example) {
        throw new Error(
          `Unknown workflow example "${String(name)}". Available: ${exampleNames().join(', ')}`,
        );
      }
      return {
        contents: [{ uri: uri.href, mimeType: JSON_MIME, text: example.json }],
      };
    },
  );
}
