import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildWorkflowJsonSchemas,
  serializeSchema,
} from '../../../scripts/workflow-schema/generate';

/**
 * Locate the MCP package's committed schema dir by walking up from the cwd.
 * Robust to where Vitest is launched from; avoids `import.meta.url`, which Vite
 * does not expose as a `file://` URL under the test transform.
 */
function findGeneratedDir(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(dir, 'packages/workflow-mcp/src/generated');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate packages/workflow-mcp/src/generated from ${process.cwd()}`);
}

/**
 * Drift guard for the workflow JSON Schema shipped by
 * `@api-workbench/workflow-mcp`. The schema is generated from these Zod schemas;
 * this test regenerates it in-memory and asserts the committed files still
 * match. If someone edits `shared/workflow.ts` (or a schema it depends on)
 * without regenerating, this fails — run:
 *
 *   npm run emit:workflow-schema --workspace @api-workbench/desktop
 */
describe('workflow JSON Schema (workflow-mcp)', () => {
  const generatedDir = findGeneratedDir();
  const generated = buildWorkflowJsonSchemas();

  it('generates a schema for every committed file', () => {
    expect(generated.map((g) => g.file).sort()).toEqual([
      'workflow-graph.schema.json',
      'workflow.schema.json',
    ]);
  });

  for (const { file, schema } of generated) {
    it(`${file} is up to date with shared/workflow.ts`, () => {
      const committed = readFileSync(join(generatedDir, file), 'utf8');
      expect(
        committed,
        `${file} is stale — run: npm run emit:workflow-schema --workspace @api-workbench/desktop`,
      ).toBe(serializeSchema(schema));
    });
  }
});
