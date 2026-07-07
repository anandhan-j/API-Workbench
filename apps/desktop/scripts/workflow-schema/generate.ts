import { zodToJsonSchema } from 'zod-to-json-schema';

import { WorkflowExport, WorkflowGraph } from '../../src/shared/workflow';

/**
 * The single source of truth for the workflow JSON Schema shipped by the
 * `@api-workbench/workflow-mcp` package. The schema is *generated* from the
 * app's own Zod schemas (`@shared/workflow`) rather than hand-copied, so it can
 * never drift from what the app actually imports.
 *
 * Both consumers import this module:
 *  - `scripts/emit-workflow-schema.mjs` bundles and runs it to write the JSON
 *    into `packages/workflow-mcp/src/generated/`.
 *  - `src/shared/__tests__/workflow-schema-drift.test.ts` regenerates in-memory
 *    and asserts the committed files still match — a CI drift guard.
 */

export interface GeneratedSchema {
  /** File name under the MCP package's `src/generated/` directory. */
  file: string;
  /** The JSON Schema (draft-07) produced by `zod-to-json-schema`. */
  schema: Record<string, unknown>;
}

export function buildWorkflowJsonSchemas(): GeneratedSchema[] {
  return [
    {
      file: 'workflow.schema.json',
      schema: zodToJsonSchema(WorkflowExport, {
        name: 'WorkflowExport',
      }) as Record<string, unknown>,
    },
    {
      file: 'workflow-graph.schema.json',
      schema: zodToJsonSchema(WorkflowGraph, {
        name: 'WorkflowGraph',
      }) as Record<string, unknown>,
    },
  ];
}

/**
 * Canonical serialization shared by the emitter and the drift-guard test so the
 * committed file and the regenerated output compare byte-for-byte.
 */
export function serializeSchema(schema: unknown): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
