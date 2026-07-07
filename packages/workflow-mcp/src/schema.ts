import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads the generated workflow JSON Schemas that ship with this package.
 *
 * The schemas are generated from the app's Zod definitions by the desktop
 * workspace (`npm run emit:workflow-schema`) and committed under
 * `src/generated/`; the build step copies them to `dist/generated/` so they sit
 * next to this module at runtime. Read via `fs` (rather than a JSON import) to
 * avoid ESM JSON import-attribute friction across Node versions.
 */
function loadSchema(fileName: string): Record<string, unknown> {
  const url = new URL(`./generated/${fileName}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as Record<string, unknown>;
}

/** JSON Schema (draft-07) for a full `.workflow.json` export bundle. */
export const workflowExportSchema = loadSchema('workflow.schema.json');

/** JSON Schema (draft-07) for a bare workflow graph (`{ nodes, edges, groups }`). */
export const workflowGraphSchema = loadSchema('workflow-graph.schema.json');

export type SchemaRoot = 'export' | 'graph';

export function getSchema(root: SchemaRoot = 'export'): Record<string, unknown> {
  return root === 'graph' ? workflowGraphSchema : workflowExportSchema;
}
