import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Emits the workflow JSON Schema into the `@api-workbench/workflow-mcp` package.
 *
 * The generator (`scripts/workflow-schema/generate.ts`) imports the app's Zod
 * schemas, which pull in TypeScript and the `@shared` sibling modules. There is
 * no standalone TS runner in this repo, so — exactly like `build:example-plugins`
 * — we esbuild-bundle the generator to a self-contained ESM file and import it.
 *
 * Run via the desktop workspace:
 *   npm run emit:workflow-schema --workspace @api-workbench/desktop
 */
const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const repoRoot = resolve(here, '..', '..', '..');
const outDir = join(repoRoot, 'packages', 'workflow-mcp', 'src', 'generated');

const bundled = await build({
  entryPoints: [join(here, 'workflow-schema', 'generate.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  write: false,
  logLevel: 'warning',
});

const tmpFile = join(tmpdir(), `emit-workflow-schema-${process.pid}.mjs`);
writeFileSync(tmpFile, bundled.outputFiles[0].text, 'utf8');
try {
  const { buildWorkflowJsonSchemas, serializeSchema } = await import(pathToFileURL(tmpFile).href);
  mkdirSync(outDir, { recursive: true });
  for (const { file, schema } of buildWorkflowJsonSchemas()) {
    const target = join(outDir, file);
    writeFileSync(target, serializeSchema(schema), 'utf8');
    console.log(`wrote ${target}`);
  }
} finally {
  rmSync(tmpFile, { force: true });
}
