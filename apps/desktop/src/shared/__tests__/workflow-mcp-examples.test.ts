import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { WorkflowExport } from '../workflow';

/**
 * Guards the example workflows shipped by `@api-workbench/workflow-mcp`. Each
 * example must:
 *   1. parse cleanly against the *real* app schema (`WorkflowExport.parse`), so
 *      it genuinely imports into API Workbench, and
 *   2. validate against the *generated* JSON Schema the MCP server ships, so the
 *      schema the model authors against accepts real, canonical workflows.
 *
 * If a schema change breaks the examples, regenerate + re-author them.
 */
function findPackageDir(...segments: string[]): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(dir, ...segments);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate ${segments.join('/')} from ${process.cwd()}`);
}

const examplesDir = findPackageDir('packages', 'workflow-mcp', 'src', 'examples');
const schemaPath = join(
  findPackageDir('packages', 'workflow-mcp', 'src', 'generated'),
  'workflow.schema.json',
);

const exampleFiles = readdirSync(examplesDir).filter((f) => f.endsWith('.workflow.json'));

describe('workflow-mcp example library', () => {
  it('ships at least one example', () => {
    expect(exampleFiles.length).toBeGreaterThan(0);
  });

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')));

  for (const file of exampleFiles) {
    const data = JSON.parse(readFileSync(join(examplesDir, file), 'utf8'));

    it(`${file} imports into the app (WorkflowExport.parse)`, () => {
      const result = WorkflowExport.safeParse(data);
      expect(result.success, result.success ? '' : JSON.stringify(result.error.issues, null, 2)).toBe(
        true,
      );
    });

    it(`${file} validates against the generated JSON Schema`, () => {
      const ok = validate(data);
      expect(ok, ok ? '' : JSON.stringify(validate.errors, null, 2)).toBe(true);
    });
  }
});
