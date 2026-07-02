import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Capability, PluginContributionIndex } from '@shared/plugins';
import { invoke, isBridgeAvailable, onPluginsChanged } from '../../lib/ipc';

/**
 * React Query hooks for the plugin system (Phase 16, ADR-0007).
 *
 * One `plugins.changed` push subscription (per query client) invalidates every
 * `['plugins', …]` query, so the installed list and the contribution index stay
 * live as plugins are installed, toggled, or crash.
 */

const EMPTY_CONTRIBUTIONS: PluginContributionIndex = {
  nodes: [],
  requestTypes: [],
  authProviders: [],
  importers: [],
};

const subscribedClients = new WeakSet<QueryClient>();

/** Invalidate all plugin queries when the main process reports a change. */
function usePluginsChangedInvalidation(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isBridgeAvailable() || subscribedClients.has(qc)) return;
    subscribedClients.add(qc);
    // Deliberately never unsubscribed: the subscription is app-lifetime and
    // shared by every plugin hook mounted against this query client.
    onPluginsChanged(() => {
      void qc.invalidateQueries({ queryKey: ['plugins'] });
    });
  }, [qc]);
}

/** Installed plugins, as shown on the Plugins page. */
export function usePlugins() {
  usePluginsChangedInvalidation();
  return useQuery({
    queryKey: ['plugins', 'list'],
    queryFn: () => invoke('plugins.list', {}),
    enabled: isBridgeAvailable(),
  });
}

/**
 * The aggregated contribution index from every enabled plugin — the single
 * source for all plugin-driven UI (palette, editors, pickers). Resolves to an
 * empty index outside Electron or before the query lands, so consumers render
 * exactly the built-in UI when no plugins contribute anything.
 */
export function usePluginContributions(): PluginContributionIndex {
  usePluginsChangedInvalidation();
  const query = useQuery({
    queryKey: ['plugins', 'contributions'],
    queryFn: () => invoke('plugins.contributions', {}),
    enabled: isBridgeAvailable(),
  });
  return query.data ?? EMPTY_CONTRIBUTIONS;
}

export function usePluginMutations() {
  const qc = useQueryClient();
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['plugins'] });
  };
  return {
    inspect: useMutation({
      mutationFn: (path: string) => invoke('plugins.inspect', { path }),
    }),
    install: useMutation({
      mutationFn: (input: { path: string; grantedCapabilities: Capability[] }) =>
        invoke('plugins.install', input),
      onSuccess: invalidate,
    }),
    installDev: useMutation({
      mutationFn: (input: { path: string; grantedCapabilities: Capability[] }) =>
        invoke('plugins.installDev', input),
      onSuccess: invalidate,
    }),
    uninstall: useMutation({
      mutationFn: (id: string) => invoke('plugins.uninstall', { id }),
      onSuccess: invalidate,
    }),
    setEnabled: useMutation({
      mutationFn: (input: { id: string; enabled: boolean }) =>
        invoke('plugins.setEnabled', input),
      onSuccess: invalidate,
    }),
  };
}
