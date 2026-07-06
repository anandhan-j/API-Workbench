import { createWriteStream, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import semverSatisfies from 'semver/functions/satisfies';
import { PluginManifest, SDK_VERSION } from '@shared/plugins';

/**
 * Plugin package loading and validation (Phase 16, ADR-0007).
 *
 * A plugin package is a directory (or `.awbx` zip archive of one) containing
 * `manifest.json` and the bundled entry it names. The loader is the security
 * gate: it validates the manifest shape, checks SDK compatibility, and — for
 * archives — refuses path traversal, symlinks, and oversized content before a
 * single byte lands in the install directory. Nothing here executes plugin
 * code; activation happens later in the isolated host process.
 */

export class PluginLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginLoadError';
  }
}

/** Archive limits: entries ≤ 20 MB, total ≤ 50 MB, ≤ 2000 entries. */
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_MANIFEST_BYTES = 256 * 1024;

export const PLUGIN_ARCHIVE_EXTENSION = '.awbx';

/** Reads and validates `manifest.json` from a plugin directory. */
export function readManifest(pluginDir: string): PluginManifest {
  const manifestPath = join(pluginDir, 'manifest.json');
  let raw: string;
  try {
    if (statSync(manifestPath).size > MAX_MANIFEST_BYTES) {
      throw new PluginLoadError('manifest.json exceeds the size limit');
    }
    raw = readFileSync(manifestPath, 'utf8');
  } catch (error) {
    if (error instanceof PluginLoadError) throw error;
    throw new PluginLoadError(`Plugin package has no readable manifest.json (${pluginDir})`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new PluginLoadError('manifest.json is not valid JSON');
  }

  const parsed = PluginManifest.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const at = issue?.path.join('.') || 'manifest';
    throw new PluginLoadError(`Invalid manifest: ${at}: ${issue?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

/** Rejects a manifest whose SDK range this app does not satisfy. */
export function assertSdkCompatible(manifest: PluginManifest, sdkVersion = SDK_VERSION): void {
  if (!semverSatisfies(sdkVersion, manifest.engines.sdk)) {
    throw new PluginLoadError(
      `Plugin "${manifest.id}" requires SDK ${manifest.engines.sdk}, but this app provides ${sdkVersion}`,
    );
  }
}

/**
 * Validates that the manifest's `main` entry exists inside the plugin
 * directory (realpath containment — a symlinked entry cannot escape).
 */
export function resolveEntry(pluginDir: string, manifest: PluginManifest): string {
  if (isAbsolute(manifest.main) || normalize(manifest.main).split(sep).includes('..')) {
    throw new PluginLoadError(`Invalid entry path: ${manifest.main}`);
  }
  const rootReal = realpathSync(pluginDir);
  let entryReal: string;
  try {
    entryReal = realpathSync(resolve(pluginDir, manifest.main));
  } catch {
    throw new PluginLoadError(`Entry "${manifest.main}" does not exist in the plugin package`);
  }
  if (entryReal !== rootReal && !entryReal.startsWith(rootReal + sep)) {
    throw new PluginLoadError(`Entry "${manifest.main}" escapes the plugin directory`);
  }
  return entryReal;
}

/** Full validation of an on-disk plugin directory. Returns the manifest. */
export function validatePluginDir(pluginDir: string): PluginManifest {
  const manifest = readManifest(pluginDir);
  assertSdkCompatible(manifest);
  resolveEntry(pluginDir, manifest);
  return manifest;
}

function assertSafeEntryName(fileName: string): string {
  // Zip entry names use '/'; refuse absolute paths, drive letters, and '..'.
  if (fileName.includes('\\')) throw new PluginLoadError(`Unsafe archive entry: ${fileName}`);
  if (fileName.startsWith('/') || /^[a-zA-Z]:/.test(fileName)) {
    throw new PluginLoadError(`Unsafe archive entry: ${fileName}`);
  }
  if (fileName.split('/').includes('..')) {
    throw new PluginLoadError(`Unsafe archive entry: ${fileName}`);
  }
  return fileName;
}

function isSymlinkEntry(entry: yauzl.Entry): boolean {
  // Unix mode lives in the upper 16 bits of externalFileAttributes; 0xA000 = symlink.
  const mode = entry.externalFileAttributes >>> 16;
  return (mode & 0xf000) === 0xa000;
}

/**
 * Extracts a `.awbx` (zip) plugin archive into `targetDir` with hard safety
 * limits. The caller owns `targetDir` cleanup on failure.
 */
export async function extractArchive(archivePath: string, targetDir: string): Promise<void> {
  const zip = await new Promise<yauzl.ZipFile>((res, rej) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (err, file) =>
      err ? rej(new PluginLoadError(`Cannot open archive: ${err.message}`)) : res(file),
    );
  });

  let entries = 0;
  let totalBytes = 0;

  try {
    await new Promise<void>((res, rej) => {
      zip.on('error', (err: Error) => rej(new PluginLoadError(`Archive error: ${err.message}`)));
      zip.on('end', () => res());
      zip.on('entry', (entry: yauzl.Entry) => {
        void (async () => {
          if (++entries > MAX_ENTRIES) {
            throw new PluginLoadError(`Archive has more than ${MAX_ENTRIES} entries`);
          }
          const name = assertSafeEntryName(entry.fileName);
          if (isSymlinkEntry(entry)) {
            throw new PluginLoadError(`Archive contains a symlink: ${name}`);
          }
          if (name.endsWith('/')) {
            zip.readEntry();
            return;
          }
          if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
            throw new PluginLoadError(`Archive entry too large: ${name}`);
          }
          totalBytes += entry.uncompressedSize;
          if (totalBytes > MAX_TOTAL_BYTES) {
            throw new PluginLoadError('Archive exceeds the total size limit');
          }
          const dest = join(targetDir, ...name.split('/'));
          mkdirSync(dirname(dest), { recursive: true });
          const stream = await new Promise<NodeJS.ReadableStream>((sres, srej) => {
            zip.openReadStream(entry, (err, s) => (err ? srej(err) : sres(s)));
          });
          await pipeline(stream, createWriteStream(dest));
          zip.readEntry();
        })().catch(rej);
      });
      zip.readEntry();
    });
  } catch (error) {
    rmSync(targetDir, { recursive: true, force: true });
    if (error instanceof PluginLoadError) throw error;
    throw new PluginLoadError(`Archive extraction failed: ${(error as Error).message}`);
  }
}
