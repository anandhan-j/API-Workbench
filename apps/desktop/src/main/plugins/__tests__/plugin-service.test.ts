// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import type { Capability, PluginManifest } from '@shared/plugins';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { PluginService, type PluginHostPort } from '../plugin-service';
import { PluginLoadError } from '../loader';

interface FakeHost extends PluginHostPort {
  activations: Array<{ pluginId: string; entryPath: string; grantedCapabilities: Capability[] }>;
  deactivations: string[];
  failFor: Set<string>;
  statuses: Map<string, { status: 'active' | 'error' | 'host-failed'; message?: string }>;
}

function fakeHost(): FakeHost {
  const host: FakeHost = {
    activations: [],
    deactivations: [],
    failFor: new Set(),
    statuses: new Map(),
    activate(input) {
      if (host.failFor.has(input.pluginId)) {
        return Promise.reject(new Error(`activation failed for ${input.pluginId}`));
      }
      host.activations.push({
        pluginId: input.pluginId,
        entryPath: input.entryPath,
        grantedCapabilities: input.grantedCapabilities,
      });
      return Promise.resolve();
    },
    deactivate(pluginId) {
      host.deactivations.push(pluginId);
      return Promise.resolve();
    },
    statusOf(pluginId) {
      return host.statuses.get(pluginId) ?? { status: 'active' };
    },
  };
  return host;
}

function manifestFor(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 1,
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    main: 'dist/index.cjs',
    engines: { sdk: '^1.0.0' },
    ...overrides,
  };
}

describe('PluginService', () => {
  let dir: string;
  let persistence: PersistenceService;
  let host: FakeHost;
  let service: PluginService;

  function writePlugin(name: string, manifest: Record<string, unknown>): string {
    const pluginDir = join(dir, 'src', name);
    mkdirSync(join(pluginDir, 'dist'), { recursive: true });
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(pluginDir, 'dist', 'index.cjs'), 'module.exports = {};');
    return pluginDir;
  }

  async function writeArchive(name: string, manifest: Record<string, unknown>): Promise<string> {
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
    zip.addBuffer(Buffer.from('module.exports = {};'), 'dist/index.cjs');
    zip.end();
    const chunks: Buffer[] = [];
    for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
    const path = join(dir, `${name}.awbx`);
    writeFileSync(path, Buffer.concat(chunks));
    return path;
  }

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-svc-'));
    persistence = new PersistenceService(conn, {
      backupDir: join(dir, 'backups'),
      appVersion: '0.1.0',
    });
    host = fakeHost();
    service = new PluginService(persistence, { installRoot: join(dir, 'plugins'), host });
  });

  afterEach(() => {
    persistence.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('install from a directory copies files, persists the row, and activates', async () => {
    const src = writePlugin('a', manifestFor('com.acme.a', { capabilities: ['network'] }));
    const installed = await service.install(src, ['network']);

    expect(installed).toMatchObject({
      id: 'com.acme.a',
      name: 'Plugin com.acme.a',
      version: '1.0.0',
      enabled: true,
      devMode: false,
      grantedCapabilities: ['network'],
      status: 'active',
    });

    const installPath = join(dir, 'plugins', 'com.acme.a');
    expect(existsSync(join(installPath, 'manifest.json'))).toBe(true);
    expect(existsSync(join(installPath, 'dist', 'index.cjs'))).toBe(true);

    const row = persistence.plugins.get('com.acme.a');
    expect(row).toMatchObject({ installPath, devMode: false, enabled: true });

    expect(host.activations).toHaveLength(1);
    expect(host.activations[0]!.pluginId).toBe('com.acme.a');
    // The activated entry points into the installed copy, not the source dir.
    expect(host.activations[0]!.entryPath).toContain('plugins');
  });

  it('installDev registers the directory in place without copying', async () => {
    const src = writePlugin('devp', manifestFor('com.acme.dev'));
    const installed = await service.installDev(src, []);

    expect(installed.devMode).toBe(true);
    expect(persistence.plugins.get('com.acme.dev')?.installPath).toBe(src);
    expect(existsSync(join(dir, 'plugins', 'com.acme.dev'))).toBe(false);
    expect(host.activations[0]!.entryPath.startsWith(src)).toBe(true);
  });

  it('installDev rejects a non-directory path', async () => {
    await expect(service.installDev(join(dir, 'missing'), [])).rejects.toThrow(/Not a directory/);
  });

  it('inspect reports the manifest, and installedVersion once installed', async () => {
    const src = writePlugin('i', manifestFor('com.acme.i'));
    const fresh = await service.inspect(src);
    expect(fresh.manifest.id).toBe('com.acme.i');
    expect(fresh.installedVersion).toBeUndefined();

    await service.install(src, []);
    const upgrade = writePlugin('i2', manifestFor('com.acme.i', { version: '2.0.0' }));
    const inspected = await service.inspect(upgrade);
    expect(inspected.manifest.version).toBe('2.0.0');
    expect(inspected.installedVersion).toBe('1.0.0');
  });

  it('rejects granting a capability the manifest does not declare', async () => {
    const src = writePlugin('g', manifestFor('com.acme.g', { capabilities: ['network'] }));
    await expect(service.install(src, ['variables:write'])).rejects.toThrow(
      /"variables:write" is not declared/,
    );
    expect(persistence.plugins.get('com.acme.g')).toBeUndefined();
    expect(host.activations).toHaveLength(0);
  });

  it('setEnabled(false) deactivates and reports the disabled status', async () => {
    const src = writePlugin('e', manifestFor('com.acme.e'));
    await service.install(src, []);

    const disabled = await service.setEnabled('com.acme.e', false);
    expect(disabled.enabled).toBe(false);
    expect(disabled.status).toBe('disabled');
    expect(host.deactivations).toContain('com.acme.e');
    expect(persistence.plugins.get('com.acme.e')?.enabled).toBe(false);

    const enabled = await service.setEnabled('com.acme.e', true);
    expect(enabled.enabled).toBe(true);
    expect(host.activations).toHaveLength(2);
  });

  it('setEnabled on an unknown plugin throws', async () => {
    await expect(service.setEnabled('com.acme.none', true)).rejects.toThrow(/not installed/);
  });

  it('uninstall purges storage, row, and files for an installed plugin', async () => {
    const src = writePlugin('u', manifestFor('com.acme.u'));
    await service.install(src, []);
    persistence.pluginStorage.set('com.acme.u', 'k', 'v');

    await service.uninstall('com.acme.u');

    expect(host.deactivations).toContain('com.acme.u');
    expect(persistence.plugins.get('com.acme.u')).toBeUndefined();
    expect(persistence.pluginStorage.get('com.acme.u', 'k')).toBeUndefined();
    expect(existsSync(join(dir, 'plugins', 'com.acme.u'))).toBe(false);
    // The author's source dir is untouched.
    expect(existsSync(src)).toBe(true);
  });

  it('uninstall keeps the directory of a dev-mode plugin', async () => {
    const src = writePlugin('ud', manifestFor('com.acme.ud'));
    await service.installDev(src, []);
    await service.uninstall('com.acme.ud');
    expect(persistence.plugins.get('com.acme.ud')).toBeUndefined();
    expect(existsSync(join(src, 'manifest.json'))).toBe(true);
  });

  it('uninstalling an unknown id is a no-op', async () => {
    await expect(service.uninstall('com.acme.ghost')).resolves.toBeUndefined();
    expect(host.deactivations).toHaveLength(0);
  });

  it('upgrade preserves the enabled flag and does not activate a disabled plugin', async () => {
    const v1 = writePlugin('up1', manifestFor('com.acme.up'));
    await service.install(v1, []);
    await service.setEnabled('com.acme.up', false);
    host.activations = [];

    const v2 = writePlugin('up2', manifestFor('com.acme.up', { version: '2.0.0' }));
    const upgraded = await service.install(v2, []);

    expect(upgraded.version).toBe('2.0.0');
    expect(upgraded.enabled).toBe(false);
    expect(persistence.plugins.get('com.acme.up')).toMatchObject({
      version: '2.0.0',
      enabled: false,
    });
    expect(host.activations).toHaveLength(0);
    // The previous install was deactivated before being replaced.
    expect(host.deactivations.filter((id) => id === 'com.acme.up').length).toBeGreaterThanOrEqual(1);
  });

  it('activateInstalled skips disabled plugins and survives one failing', async () => {
    await service.install(writePlugin('a1', manifestFor('com.acme.one')), []);
    await service.install(writePlugin('a2', manifestFor('com.acme.two')), []);
    await service.install(writePlugin('a3', manifestFor('com.acme.three')), []);
    await service.setEnabled('com.acme.three', false);
    host.activations = [];
    host.failFor.add('com.acme.one');

    await expect(service.activateInstalled()).resolves.toBeUndefined();

    const activated = host.activations.map((a) => a.pluginId);
    expect(activated).toEqual(['com.acme.two']);
  });

  it('contributions aggregates only enabled plugins, tagged with pluginId/pluginName', async () => {
    const nodeContribution = {
      kind: 'uuid',
      label: 'UUID',
      configSchema: { fields: [] },
    };
    const importerContribution = {
      id: 'csv',
      label: 'CSV',
      sourceTypes: ['text'],
    };
    await service.install(
      writePlugin('c1', manifestFor('com.acme.nodes', { contributes: { nodes: [nodeContribution] } })),
      [],
    );
    await service.install(
      writePlugin(
        'c2',
        manifestFor('com.acme.imports', { contributes: { importers: [importerContribution] } }),
      ),
      [],
    );
    await service.setEnabled('com.acme.imports', false);

    const index = service.contributions();
    expect(index.nodes).toHaveLength(1);
    expect(index.nodes[0]).toMatchObject({
      pluginId: 'com.acme.nodes',
      pluginName: 'Plugin com.acme.nodes',
      kind: 'uuid',
      label: 'UUID',
    });
    expect(index.importers).toHaveLength(0);
    expect(index.requestTypes).toHaveLength(0);
    expect(index.authProviders).toHaveLength(0);
  });

  it('installs from a .awbx archive and cleans the staging dir', async () => {
    const archive = await writeArchive('arch', manifestFor('com.acme.arch'));
    const installed = await service.install(archive, []);

    expect(installed.id).toBe('com.acme.arch');
    expect(existsSync(join(dir, 'plugins', 'com.acme.arch', 'dist', 'index.cjs'))).toBe(true);
    const staging = join(dir, 'plugins', '.staging');
    expect(existsSync(staging) ? readdirSync(staging) : []).toEqual([]);
  });

  it('rejects a non-archive file', async () => {
    const path = join(dir, 'plugin.tar');
    writeFileSync(path, 'not a zip');
    await expect(service.install(path, [])).rejects.toThrow(PluginLoadError);
    await expect(service.install(path, [])).rejects.toThrow(/Expected a directory or \.awbx/);
  });

  it('list reflects every installed plugin with live status', async () => {
    await service.install(writePlugin('l1', manifestFor('com.acme.l1')), []);
    await service.installDev(writePlugin('l2', manifestFor('com.acme.l2')), []);
    host.statuses.set('com.acme.l2', { status: 'error', message: 'boom' });

    const listed = service.list();
    expect(listed.map((p) => p.id).sort()).toEqual(['com.acme.l1', 'com.acme.l2']);
    const l2 = listed.find((p) => p.id === 'com.acme.l2')!;
    expect(l2.status).toBe('error');
    expect(l2.statusMessage).toBe('boom');
    expect(l2.devMode).toBe(true);
  });

  it('describe surfaces manifest metadata (description, publisher)', async () => {
    const src = writePlugin(
      'meta',
      manifestFor('com.acme.meta', { description: 'Does things', publisher: 'Acme' }),
    );
    const installed = await service.install(src, []);
    expect(installed.description).toBe('Does things');
    expect(installed.publisher).toBe('Acme');
  });

  it('a manifest is validated before install (SDK compatibility)', async () => {
    const src = writePlugin('sdk', manifestFor('com.acme.sdk', { engines: { sdk: '^99.0.0' } }));
    await expect(service.install(src, [])).rejects.toThrow(/requires SDK/);
    expect(persistence.plugins.get('com.acme.sdk')).toBeUndefined();
  });

  it('install validates the manifest Zod shape end to end', async () => {
    const src = writePlugin('bad', { ...manifestFor('com.acme.bad'), manifestVersion: 2 });
    await expect(service.install(src, [] as PluginManifest['capabilities'])).rejects.toThrow(
      /Invalid manifest/,
    );
  });
});
