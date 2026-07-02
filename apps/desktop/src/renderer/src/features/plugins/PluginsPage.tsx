import { useMemo, useState } from 'react';
import {
  FolderOpen,
  Loader2,
  Package,
  Puzzle,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import type { Capability, InstalledPlugin, PluginInspection } from '@shared/plugins';
import { cn } from '../../lib/cn';
import { isBridgeAvailable } from '../../lib/ipc';
import { Modal } from '../../components/menu/Modal';
import { useConfirm } from '../../components/confirm/ConfirmProvider';
import { useToast } from '../../components/toast/ToastProvider';
import { usePluginContributions, usePluginMutations, usePlugins } from './use-plugins';

const CAPABILITY_LABELS: Record<Capability, string> = {
  network: 'Network access',
  'variables:read': 'Read variables',
  'variables:write': 'Write variables',
};

const STATUS_STYLE: Record<InstalledPlugin['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  disabled: 'bg-slate-500/15 text-slate-400',
  error: 'bg-rose-500/15 text-rose-400',
  'host-failed': 'bg-amber-500/15 text-amber-400',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** An inspected package awaiting user consent before installation. */
interface PendingInstall {
  path: string;
  dev: boolean;
  inspection: PluginInspection;
}

export function PluginsPage(): JSX.Element {
  const bridge = isBridgeAvailable();
  const plugins = usePlugins();
  const contributions = usePluginContributions();
  const mutations = usePluginMutations();
  const confirm = useConfirm();
  const toast = useToast();

  const [path, setPath] = useState('');
  const [pending, setPending] = useState<PendingInstall | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Contribution counts per plugin, for the installed list.
  const countsByPlugin = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }[]>();
    const tally = (
      pluginId: string,
      label: string,
      delta: number,
    ): void => {
      const list = counts.get(pluginId) ?? [];
      const entry = list.find((e) => e.label === label);
      if (entry) entry.count += delta;
      else list.push({ label, count: delta });
      counts.set(pluginId, list);
    };
    for (const c of contributions.nodes) tally(c.pluginId, 'node', 1);
    for (const c of contributions.requestTypes) tally(c.pluginId, 'request type', 1);
    for (const c of contributions.authProviders) tally(c.pluginId, 'auth provider', 1);
    for (const c of contributions.importers) tally(c.pluginId, 'importer', 1);
    return counts;
  }, [contributions]);

  const inspect = async (dev: boolean): Promise<void> => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setInspectError(null);
    try {
      const inspection = await mutations.inspect.mutateAsync(trimmed);
      setPending({ path: trimmed, dev, inspection });
    } catch (error) {
      setInspectError(errorMessage(error));
    }
  };

  const install = async (grantedCapabilities: Capability[]): Promise<void> => {
    if (!pending) return;
    const mutation = pending.dev ? mutations.installDev : mutations.install;
    try {
      const plugin = await mutation.mutateAsync({ path: pending.path, grantedCapabilities });
      toast(`Installed ${plugin.name} ${plugin.version}`);
      setPending(null);
      setPath('');
    } catch (error) {
      toast(`Install failed: ${errorMessage(error)}`, { type: 'error' });
    }
  };

  const handleUninstall = async (plugin: InstalledPlugin): Promise<void> => {
    if (
      await confirm({
        title: 'Uninstall plugin',
        message: `Uninstall "${plugin.name}"? Its contributions disappear from the app immediately.`,
        confirmLabel: 'Uninstall',
        danger: true,
      })
    ) {
      mutations.uninstall.mutate(plugin.id, {
        onSuccess: () => toast(`Uninstalled ${plugin.name}`),
        onError: (error) => toast(`Uninstall failed: ${errorMessage(error)}`, { type: 'error' }),
      });
    }
  };

  if (!bridge) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Plugins</h1>
        <p className="mt-2 text-muted">
          Plugin management requires the desktop runtime, available when running inside the
          application.
        </p>
      </div>
    );
  }

  const list = plugins.data?.plugins ?? [];
  const installing = mutations.install.isPending || mutations.installDev.isPending;

  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Plugins</h1>
      <p className="mt-1 text-sm text-muted">
        Extend the workbench with new workflow nodes, request types, auth providers, and importers.
      </p>

      {/* Install */}
      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Install a plugin</h2>
        <p className="mt-1 text-sm text-muted">
          Give the path to a plugin archive (<code>.awbx</code> / <code>.zip</code>), or load an
          unpacked plugin folder while developing.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            aria-label="Plugin path"
            placeholder="C:\path\to\plugin.awbx — or an unpacked plugin folder"
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void inspect(false)}
            disabled={!path.trim() || mutations.inspect.isPending}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {mutations.inspect.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Package size={14} />
            )}
            Install…
          </button>
          <button
            type="button"
            onClick={() => void inspect(true)}
            disabled={!path.trim() || mutations.inspect.isPending}
            title="Install an unpacked plugin folder in dev mode (reload picks up changes)"
            className="flex items-center gap-1.5 rounded-md border border-border px-4 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            <FolderOpen size={14} /> Load unpacked
          </button>
        </div>
        {inspectError && <p className="mt-2 text-sm text-danger">{inspectError}</p>}
      </section>

      {/* Installed list */}
      <section className="mt-4 rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">
            Installed plugins
            <span className="ml-2 text-xs font-normal text-muted">{list.length}</span>
          </h2>
        </div>
        {plugins.isLoading && (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        )}
        {!plugins.isLoading && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Puzzle size={28} className="text-muted/60" />
            <p className="text-sm text-muted">No plugins installed.</p>
            <p className="text-xs text-muted">
              Install a plugin archive above to add nodes, request types, auth providers, or
              importers.
            </p>
          </div>
        )}
        {list.map((plugin) => (
          <PluginRow
            key={plugin.id}
            plugin={plugin}
            counts={countsByPlugin.get(plugin.id) ?? []}
            onToggle={() =>
              mutations.setEnabled.mutate(
                { id: plugin.id, enabled: !plugin.enabled },
                {
                  onError: (error) => toast(errorMessage(error), { type: 'error' }),
                },
              )
            }
            onUninstall={() => void handleUninstall(plugin)}
          />
        ))}
      </section>

      {pending && (
        <ConsentDialog
          pending={pending}
          busy={installing}
          onConfirm={(caps) => void install(caps)}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}

function PluginRow({
  plugin,
  counts,
  onToggle,
  onUninstall,
}: {
  plugin: InstalledPlugin;
  counts: { label: string; count: number }[];
  onToggle: () => void;
  onUninstall: () => void;
}): JSX.Element {
  const contributionSummary = counts
    .map((c) => `${c.count} ${c.label}${c.count === 1 ? '' : 's'}`)
    .join(', ');
  return (
    <div className="border-b border-border px-5 py-4 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{plugin.name}</span>
            <span className="text-xs text-muted">v{plugin.version}</span>
            {plugin.publisher && <span className="text-xs text-muted">· {plugin.publisher}</span>}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                STATUS_STYLE[plugin.status],
              )}
            >
              {plugin.status}
            </span>
            {plugin.devMode && (
              <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-400">
                dev
              </span>
            )}
          </div>
          {plugin.description && (
            <p className="mt-1 truncate text-xs text-muted">{plugin.description}</p>
          )}
          {(plugin.status === 'error' || plugin.status === 'host-failed') &&
            plugin.statusMessage && (
              <p className="mt-1 break-words text-xs text-rose-400">{plugin.statusMessage}</p>
            )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {plugin.grantedCapabilities.map((cap) => (
              <span
                key={cap}
                className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted"
              >
                {CAPABILITY_LABELS[cap]}
              </span>
            ))}
            {contributionSummary && (
              <span className="text-[11px] text-muted">
                {plugin.grantedCapabilities.length > 0 && '· '}
                {contributionSummary}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={plugin.enabled}
            aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
            title={plugin.enabled ? 'Disable plugin' : 'Enable plugin'}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm',
              plugin.enabled
                ? 'border-accent text-accent'
                : 'border-border text-muted hover:bg-surface-2',
            )}
          >
            {plugin.enabled ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
            {plugin.enabled ? 'Enabled' : 'Disabled'}
          </button>
          <button
            type="button"
            onClick={onUninstall}
            aria-label={`Uninstall ${plugin.name}`}
            title="Uninstall"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Install consent: shows the inspected manifest's identity and lets the user
 * grant (or withhold) each requested capability before anything is installed.
 */
function ConsentDialog({
  pending,
  busy,
  onConfirm,
  onClose,
}: {
  pending: PendingInstall;
  busy: boolean;
  onConfirm: (grantedCapabilities: Capability[]) => void;
  onClose: () => void;
}): JSX.Element {
  const { manifest, installedVersion } = pending.inspection;
  const [granted, setGranted] = useState<Set<Capability>>(new Set(manifest.capabilities));

  const toggle = (cap: Capability): void =>
    setGranted((current) => {
      const next = new Set(current);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });

  const contributionCount =
    manifest.contributes.nodes.length +
    manifest.contributes.requestTypes.length +
    manifest.contributes.authProviders.length +
    manifest.contributes.importers.length;

  return (
    <Modal title={pending.dev ? 'Load unpacked plugin' : 'Install plugin'} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-semibold">
            {manifest.name} <span className="font-normal text-muted">v{manifest.version}</span>
          </p>
          <p className="font-mono text-xs text-muted">{manifest.id}</p>
          {manifest.publisher && <p className="mt-1 text-xs text-muted">by {manifest.publisher}</p>}
          {manifest.description && <p className="mt-2 text-muted">{manifest.description}</p>}
          <p className="mt-2 text-xs text-muted">
            Contributes {contributionCount} item{contributionCount === 1 ? '' : 's'}:{' '}
            {manifest.contributes.nodes.length} nodes, {manifest.contributes.requestTypes.length}{' '}
            request types, {manifest.contributes.authProviders.length} auth providers,{' '}
            {manifest.contributes.importers.length} importers.
          </p>
        </div>

        {installedVersion && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            Version {installedVersion} is already installed — this will upgrade it to{' '}
            {manifest.version}.
          </p>
        )}

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Requested permissions
          </p>
          {manifest.capabilities.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted">
              This plugin requests no special permissions.
            </p>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              {manifest.capabilities.map((cap) => (
                <label key={cap} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={granted.has(cap)} onChange={() => toggle(cap)} />
                  {CAPABILITY_LABELS[cap]}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-1.5 text-sm hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm([...granted])}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {installedVersion ? 'Upgrade' : 'Install'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
