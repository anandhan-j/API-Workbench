// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import type { PluginManifest } from '@shared/plugins';
import {
  PluginLoadError,
  assertSdkCompatible,
  extractArchive,
  readManifest,
  resolveEntry,
  validatePluginDir,
} from '../loader';

function manifestJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    manifestVersion: 1,
    id: 'com.acme.test',
    name: 'Test Plugin',
    version: '1.2.3',
    main: 'dist/index.cjs',
    engines: { sdk: '^1.0.0' },
    ...overrides,
  });
}

/** Creates a valid on-disk plugin dir under `root` and returns its path. */
function writePluginDir(root: string, overrides: Record<string, unknown> = {}): string {
  const dir = join(root, 'pkg');
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), manifestJson(overrides));
  writeFileSync(join(dir, 'dist', 'index.cjs'), 'module.exports = {};');
  return dir;
}

/** Renders a yazl zip to a Buffer. */
async function buildZip(build: (zip: yazl.ZipFile) => void): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  build(zip);
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Rewrites every occurrence of an entry name inside the raw zip bytes (local
 * file header + central directory). Same length required, so sizes/offsets
 * stay valid — this is how we craft names yazl itself refuses to produce.
 */
function patchEntryName(zip: Buffer, from: string, to: string): Buffer {
  if (Buffer.byteLength(from) !== Buffer.byteLength(to)) throw new Error('length mismatch');
  const out = Buffer.from(zip);
  const needle = Buffer.from(from, 'utf8');
  const replacement = Buffer.from(to, 'utf8');
  let index = out.indexOf(needle);
  while (index !== -1) {
    replacement.copy(out, index);
    index = out.indexOf(needle, index + replacement.length);
  }
  return out;
}

describe('loader', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'awb-loader-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('readManifest', () => {
    it('fails when manifest.json is missing', () => {
      mkdirSync(join(root, 'empty'));
      expect(() => readManifest(join(root, 'empty'))).toThrow(PluginLoadError);
      expect(() => readManifest(join(root, 'empty'))).toThrow(/no readable manifest/);
    });

    it('fails on invalid JSON', () => {
      const dir = join(root, 'badjson');
      mkdirSync(dir);
      writeFileSync(join(dir, 'manifest.json'), '{ not json');
      expect(() => readManifest(dir)).toThrow(/not valid JSON/);
    });

    it('fails on an oversized manifest', () => {
      const dir = join(root, 'big');
      mkdirSync(dir);
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ pad: 'x'.repeat(300 * 1024) }));
      expect(() => readManifest(dir)).toThrow(/size limit/);
    });

    it('rejects a non-reverse-DNS id', () => {
      const dir = writePluginDir(root, { id: 'NotValid' });
      expect(() => readManifest(dir)).toThrow(/Invalid manifest: id/);
    });

    it('rejects a non-semver version', () => {
      const dir = writePluginDir(root, { version: 'one.two' });
      expect(() => readManifest(dir)).toThrow(/Invalid manifest: version/);
    });

    it('rejects an invalid engines.sdk range', () => {
      const dir = writePluginDir(root, { engines: { sdk: 'not-a-range' } });
      expect(() => readManifest(dir)).toThrow(/Invalid manifest: engines\.sdk/);
    });

    it('rejects a missing main entry', () => {
      const dir = writePluginDir(root, { main: '' });
      expect(() => readManifest(dir)).toThrow(/Invalid manifest: main/);
    });

    it('parses a valid manifest with defaults applied', () => {
      const dir = writePluginDir(root);
      const manifest = readManifest(dir);
      expect(manifest.id).toBe('com.acme.test');
      expect(manifest.capabilities).toEqual([]);
      expect(manifest.contributes).toEqual({
        nodes: [],
        requestTypes: [],
        authProviders: [],
        importers: [],
      });
    });
  });

  describe('assertSdkCompatible', () => {
    const manifest = { id: 'com.acme.test', engines: { sdk: '^1.0.0' } } as PluginManifest;

    it('passes when the app SDK satisfies the range', () => {
      expect(() => assertSdkCompatible(manifest, '1.4.0')).not.toThrow();
    });

    it('fails when the app SDK is outside the range', () => {
      expect(() => assertSdkCompatible(manifest, '2.0.0')).toThrow(/requires SDK \^1\.0\.0/);
      expect(() => assertSdkCompatible(manifest, '0.9.0')).toThrow(PluginLoadError);
    });
  });

  describe('resolveEntry', () => {
    it('resolves a valid relative entry to its real path', () => {
      const dir = writePluginDir(root);
      const manifest = readManifest(dir);
      const entry = resolveEntry(dir, manifest);
      expect(entry.endsWith('index.cjs')).toBe(true);
      expect(existsSync(entry)).toBe(true);
    });

    it('rejects a missing entry file', () => {
      const dir = writePluginDir(root, { main: 'dist/nope.cjs' });
      const manifest = readManifest(dir);
      expect(() => resolveEntry(dir, manifest)).toThrow(/does not exist/);
    });

    it('rejects an absolute entry path', () => {
      const dir = writePluginDir(root);
      const manifest = { ...readManifest(dir), main: join(root, 'pkg', 'dist', 'index.cjs') };
      expect(() => resolveEntry(dir, manifest)).toThrow(/Invalid entry path/);
    });

    it('rejects ".." segments in the entry path', () => {
      const outside = join(root, 'outside.cjs');
      writeFileSync(outside, '');
      const dir = writePluginDir(root);
      const manifest = { ...readManifest(dir), main: '../outside.cjs' };
      expect(() => resolveEntry(dir, manifest)).toThrow(/Invalid entry path/);
    });

    it('rejects an entry that escapes via a symlinked directory', () => {
      const outside = join(root, 'elsewhere');
      mkdirSync(outside);
      writeFileSync(join(outside, 'evil.cjs'), '');
      const dir = writePluginDir(root);
      // 'junction' works without privileges on Windows and degrades to a dir symlink elsewhere.
      symlinkSync(outside, join(dir, 'link'), 'junction');
      const manifest = { ...readManifest(dir), main: 'link/evil.cjs' };
      expect(() => resolveEntry(dir, manifest)).toThrow(/escapes the plugin directory/);
    });
  });

  describe('validatePluginDir', () => {
    it('returns the manifest for a valid package', () => {
      const dir = writePluginDir(root);
      expect(validatePluginDir(dir).id).toBe('com.acme.test');
    });

    it('propagates SDK incompatibility', () => {
      const dir = writePluginDir(root, { engines: { sdk: '^99.0.0' } });
      expect(() => validatePluginDir(dir)).toThrow(/requires SDK/);
    });
  });

  describe('extractArchive', () => {
    async function writeArchive(bytes: Buffer): Promise<string> {
      const path = join(root, 'pkg.awbx');
      writeFileSync(path, bytes);
      return path;
    }

    it('extracts files and nested directories', async () => {
      const bytes = await buildZip((zip) => {
        zip.addBuffer(Buffer.from(manifestJson()), 'manifest.json');
        zip.addEmptyDirectory('dist');
        zip.addBuffer(Buffer.from('module.exports = {};'), 'dist/index.cjs');
        zip.addBuffer(Buffer.from('deep'), 'a/b/c.txt');
      });
      const archive = await writeArchive(bytes);
      const target = join(root, 'out');
      await extractArchive(archive, target);
      expect(readFileSync(join(target, 'manifest.json'), 'utf8')).toBe(manifestJson());
      expect(readFileSync(join(target, 'dist', 'index.cjs'), 'utf8')).toBe('module.exports = {};');
      expect(readFileSync(join(target, 'a', 'b', 'c.txt'), 'utf8')).toBe('deep');
      // The extracted result is itself a valid plugin dir.
      expect(validatePluginDir(target).id).toBe('com.acme.test');
    });

    it('rejects "../" path traversal and cleans up the target dir', async () => {
      const bytes = await buildZip((zip) => {
        zip.addBuffer(Buffer.from('safe'), 'ok.txt');
        zip.addBuffer(Buffer.from('evil'), 'AA/evil.txt');
      });
      const archive = await writeArchive(patchEntryName(bytes, 'AA/evil.txt', '../evil.txt'));
      const target = join(root, 'out');
      mkdirSync(target);
      await expect(extractArchive(archive, target)).rejects.toThrow(PluginLoadError);
      expect(existsSync(target)).toBe(false);
      expect(existsSync(join(root, 'evil.txt'))).toBe(false);
    });

    it('rejects absolute entry paths', async () => {
      const bytes = await buildZip((zip) => {
        zip.addBuffer(Buffer.from('evil'), 'Zabs.txt');
      });
      const archive = await writeArchive(patchEntryName(bytes, 'Zabs.txt', '/abs.txt'));
      const target = join(root, 'out');
      await expect(extractArchive(archive, target)).rejects.toThrow(PluginLoadError);
      expect(existsSync(target)).toBe(false);
    });

    it('rejects symlink entries', async () => {
      const bytes = await buildZip((zip) => {
        // 0o120644: S_IFLNK in the unix mode bits of externalFileAttributes.
        zip.addBuffer(Buffer.from('/etc/passwd'), 'sneaky-link', { mode: 0o120644 });
      });
      const archive = await writeArchive(bytes);
      const target = join(root, 'out');
      await expect(extractArchive(archive, target)).rejects.toThrow(/symlink/);
      expect(existsSync(target)).toBe(false);
    });

    it('enforces the total uncompressed size limit across entries', async () => {
      // Three entries of exactly 20 MB pass the per-entry cap but total 60 MB > 50 MB.
      const big = Buffer.alloc(20 * 1024 * 1024);
      const bytes = await buildZip((zip) => {
        zip.addBuffer(big, 'one.bin');
        zip.addBuffer(big, 'two.bin');
        zip.addBuffer(big, 'three.bin');
      });
      const archive = await writeArchive(bytes);
      const target = join(root, 'out');
      await expect(extractArchive(archive, target)).rejects.toThrow(/total size limit/);
      expect(existsSync(target)).toBe(false);
    }, 30_000);

    it('fails cleanly on a file that is not a zip', async () => {
      const archive = await writeArchive(Buffer.from('this is not a zip'));
      const target = join(root, 'out');
      await expect(extractArchive(archive, target)).rejects.toThrow(PluginLoadError);
      expect(existsSync(target)).toBe(false);
    });
  });
});
