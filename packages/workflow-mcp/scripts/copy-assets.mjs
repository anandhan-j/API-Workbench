import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies non-TS assets that `tsc` does not emit (the generated JSON Schemas and
 * the bundled example workflows) from `src/` to `dist/`, so `files: ["dist"]`
 * ships them and the loaders (`src/schema.ts`, `src/examples.ts`) can read them
 * at runtime relative to the compiled module.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');

const assets = [
  {
    src: join(pkgRoot, 'src', 'generated'),
    dest: join(pkgRoot, 'dist', 'generated'),
    hint: 'run: npm run emit:workflow-schema --workspace @api-workbench/desktop',
  },
  {
    src: join(pkgRoot, 'src', 'examples'),
    dest: join(pkgRoot, 'dist', 'examples'),
    hint: 'example workflows are missing from src/examples/',
  },
];

for (const { src, dest, hint } of assets) {
  if (!existsSync(src)) {
    console.error(`missing ${src} — ${hint}`);
    process.exit(1);
  }
  cpSync(src, dest, { recursive: true });
  console.log(`copied ${src} -> ${dest}`);
}
