// Removes the npm-workspace self-symlink `node_modules/@api-workbench/desktop`.
//
// npm workspaces symlink each workspace package into the root node_modules. The
// app links to itself (`@api-workbench/desktop` -> apps/desktop). electron-builder's
// native-dependency rebuild (@electron/rebuild) walks the whole node_modules tree
// and cannot `stat` that reparse point on Windows, failing with EACCES. Nothing
// imports the app by its package name, so removing the link is safe; npm recreates
// it on the next `npm install`.
import { lstatSync, rmdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const link = join(root, 'node_modules', '@api-workbench', 'desktop');

try {
  lstatSync(link); // throws if the link is absent — nothing to do
  try {
    // rmdir removes a junction / directory symlink WITHOUT recursing into its target.
    rmdirSync(link);
  } catch {
    // Fall back for a file-style symlink.
    unlinkSync(link);
  }
  console.log(`[strip-self-symlink] removed ${link}`);
} catch {
  // Link not present (e.g. already stripped, or a non-workspace install) — fine.
}
