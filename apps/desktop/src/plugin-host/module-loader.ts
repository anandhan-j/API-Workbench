import { realpathSync } from 'node:fs';
import { dirname, sep } from 'node:path';
import { createRequire } from 'node:module';

/**
 * Loads a plugin's bundled CommonJS entry (Phase 16, ADR-0010). The entry
 * must already have passed the loader's realpath-containment validation in
 * main; this re-asserts containment at load time (the file could have been
 * swapped for a symlink between install and activation) and requires it with
 * a fresh resolver so plugins never resolve into the app's node_modules.
 */
export function loadPluginModule(entryPath: string): unknown {
  const real = realpathSync(entryPath);
  const dir = realpathSync(dirname(entryPath));
  if (real !== dir && !real.startsWith(dir + sep)) {
    throw new Error(`Entry escapes its plugin directory: ${entryPath}`);
  }
  const requireFrom = createRequire(real);
  return requireFrom(real);
}
