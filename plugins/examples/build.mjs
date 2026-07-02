import { build } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bundles every example plugin to its `dist/index.cjs` — the exact shape the
 * SDK guide prescribes for real plugins. Run via the desktop workspace:
 * `npm run build:example-plugins --workspace @api-workbench/desktop`.
 */
const root = dirname(fileURLToPath(import.meta.url));
const examples = readdirSync(root).filter((name) => {
  try {
    return statSync(join(root, name, 'manifest.json')).isFile();
  } catch {
    return false;
  }
});

for (const name of examples) {
  await build({
    entryPoints: [join(root, name, 'src', 'index.ts')],
    outfile: join(root, name, 'dist', 'index.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    logLevel: 'warning',
  });
  console.log(`built ${name}/dist/index.cjs`);
}
