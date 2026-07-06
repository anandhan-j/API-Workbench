import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  type Capability,
  type InstalledPlugin,
  type PluginContributionIndex,
  type PluginInspection,
  type PluginManifest,
} from '@shared/plugins';
import type { PersistenceService } from '../persistence';
import type { PluginRow } from '../persistence/schema';
import {
  PLUGIN_ARCHIVE_EXTENSION,
  PluginLoadError,
  extractArchive,
  resolveEntry,
  validatePluginDir,
} from './loader';

/**
 * The plugin host boundary as the service sees it (implemented by the
 * utility-process host manager; faked in tests). Activation is idempotent per
 * plugin; `statusOf` reflects the live process state.
 */
export interface PluginHostPort {
  activate(input: {
    pluginId: string;
    entryPath: string;
    grantedCapabilities: Capability[];
    manifest: PluginManifest;
  }): Promise<void>;
  deactivate(pluginId: string): Promise<void>;
  statusOf(pluginId: string): { status: 'active' | 'error' | 'host-failed'; message?: string };
}

export interface PluginServiceDeps {
  /** Root directory installed plugins are copied into (`<userData>/plugins`). */
  installRoot: string;
  host: PluginHostPort;
  log?: (level: 'info' | 'warn' | 'error', message: string, context?: object) => void;
}

/**
 * Facade over plugin install/lifecycle (Phase 16, ADR-0007): validates and
 * installs packages via the loader, persists install state and capability
 * grants, aggregates contributions for the renderer, and drives the host's
 * activate/deactivate. Never executes plugin code itself.
 */
export class PluginService {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly deps: PluginServiceDeps,
  ) {}

  /** Validates a package (dir or `.awbx`) without installing. */
  async inspect(path: string): Promise<PluginInspection> {
    const { dir, cleanup } = await this.materialize(path);
    try {
      const manifest = validatePluginDir(dir);
      const existing = this.persistence.plugins.get(manifest.id);
      return {
        manifest,
        ...(existing ? { installedVersion: existing.version } : {}),
      };
    } finally {
      cleanup();
    }
  }

  /** Installs (or upgrades) a package and activates it. */
  async install(path: string, grantedCapabilities: Capability[]): Promise<InstalledPlugin> {
    const { dir, cleanup } = await this.materialize(path);
    try {
      const manifest = validatePluginDir(dir);
      this.assertGrantsAreDeclared(manifest, grantedCapabilities);

      const installPath = join(this.deps.installRoot, manifest.id);
      const previous = this.persistence.plugins.get(manifest.id);
      if (previous) await this.deps.host.deactivate(manifest.id);

      rmSync(installPath, { recursive: true, force: true });
      mkdirSync(this.deps.installRoot, { recursive: true });
      cpSync(dir, installPath, { recursive: true });

      const row = this.persistence.plugins.save({
        manifest,
        grantedCapabilities,
        installPath,
        devMode: false,
      });
      this.deps.log?.('info', 'Plugin installed', { id: manifest.id, version: manifest.version });
      if (row.enabled) await this.activateRow(row);
      return this.describe(row);
    } finally {
      cleanup();
    }
  }

  /** Registers an unpacked plugin directory in place (plugin-author dev loop). */
  async installDev(path: string, grantedCapabilities: Capability[]): Promise<InstalledPlugin> {
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      throw new PluginLoadError(`Not a directory: ${path}`);
    }
    const manifest = validatePluginDir(path);
    this.assertGrantsAreDeclared(manifest, grantedCapabilities);
    const previous = this.persistence.plugins.get(manifest.id);
    if (previous) await this.deps.host.deactivate(manifest.id);
    const row = this.persistence.plugins.save({
      manifest,
      grantedCapabilities,
      installPath: path,
      devMode: true,
    });
    this.deps.log?.('info', 'Plugin loaded unpacked', { id: manifest.id, path });
    if (row.enabled) await this.activateRow(row);
    return this.describe(row);
  }

  async uninstall(id: string): Promise<void> {
    const row = this.persistence.plugins.get(id);
    if (!row) return;
    await this.deps.host.deactivate(id);
    this.persistence.pluginStorage.deleteAll(id);
    this.persistence.plugins.delete(id);
    // Dev-mode plugins live in the author's working tree; never delete those.
    if (!row.devMode) rmSync(row.installPath, { recursive: true, force: true });
    this.deps.log?.('info', 'Plugin uninstalled', { id });
  }

  async setEnabled(id: string, enabled: boolean): Promise<InstalledPlugin> {
    const row = this.persistence.plugins.get(id);
    if (!row) throw new PluginLoadError(`Plugin not installed: ${id}`);
    this.persistence.plugins.setEnabled(id, enabled);
    if (enabled) {
      await this.activateRow({ ...row, enabled: true });
    } else {
      await this.deps.host.deactivate(id);
    }
    return this.describe({ ...row, enabled });
  }

  /** Activates every enabled plugin (startup). Failures are per-plugin, not fatal. */
  async activateInstalled(): Promise<void> {
    for (const row of this.persistence.plugins.list()) {
      if (!row.enabled) continue;
      await this.activateRow(row).catch((error: unknown) => {
        this.deps.log?.('error', 'Plugin activation failed', {
          id: row.id,
          message: (error as Error).message,
        });
      });
    }
  }

  list(): InstalledPlugin[] {
    return this.persistence.plugins.list().map((row) => this.describe(row));
  }

  /** Aggregated contributions of every enabled plugin, for the renderer. */
  contributions(): PluginContributionIndex {
    const index: PluginContributionIndex = {
      nodes: [],
      requestTypes: [],
      authProviders: [],
      importers: [],
    };
    for (const row of this.persistence.plugins.list()) {
      if (!row.enabled) continue;
      const manifest = row.manifest;
      const tag = { pluginId: manifest.id, pluginName: manifest.name };
      index.nodes.push(...manifest.contributes.nodes.map((c) => ({ ...tag, ...c })));
      index.requestTypes.push(...manifest.contributes.requestTypes.map((c) => ({ ...tag, ...c })));
      index.authProviders.push(...manifest.contributes.authProviders.map((c) => ({ ...tag, ...c })));
      index.importers.push(...manifest.contributes.importers.map((c) => ({ ...tag, ...c })));
    }
    return index;
  }

  private async activateRow(row: PluginRow): Promise<void> {
    const entryPath = resolveEntry(row.installPath, row.manifest);
    await this.deps.host.activate({
      pluginId: row.id,
      entryPath,
      grantedCapabilities: row.grantedCapabilities as Capability[],
      manifest: row.manifest,
    });
  }

  private describe(row: PluginRow): InstalledPlugin {
    const hostStatus = row.enabled
      ? this.deps.host.statusOf(row.id)
      : ({ status: 'disabled' } as const);
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      ...(row.manifest.description ? { description: row.manifest.description } : {}),
      ...(row.manifest.publisher ? { publisher: row.manifest.publisher } : {}),
      enabled: row.enabled,
      devMode: row.devMode,
      grantedCapabilities: row.grantedCapabilities as Capability[],
      status: hostStatus.status,
      ...('message' in hostStatus && hostStatus.message
        ? { statusMessage: hostStatus.message }
        : {}),
      installedAt: row.installedAt,
      updatedAt: row.updatedAt,
    };
  }

  private assertGrantsAreDeclared(manifest: PluginManifest, granted: Capability[]): void {
    for (const cap of granted) {
      if (!manifest.capabilities.includes(cap)) {
        throw new PluginLoadError(`Capability "${cap}" is not declared by the plugin manifest`);
      }
    }
  }

  /** Stages an archive into a temp dir, or passes a directory through. */
  private async materialize(path: string): Promise<{ dir: string; cleanup: () => void }> {
    if (!existsSync(path)) throw new PluginLoadError(`No such file or directory: ${path}`);
    if (statSync(path).isDirectory()) {
      return { dir: path, cleanup: () => undefined };
    }
    if (!path.toLowerCase().endsWith(PLUGIN_ARCHIVE_EXTENSION) && !path.toLowerCase().endsWith('.zip')) {
      throw new PluginLoadError(`Expected a directory or ${PLUGIN_ARCHIVE_EXTENSION} archive`);
    }
    const staging = join(this.deps.installRoot, '.staging', randomUUID());
    mkdirSync(staging, { recursive: true });
    await extractArchive(path, staging);
    return { dir: staging, cleanup: () => rmSync(staging, { recursive: true, force: true }) };
  }
}
