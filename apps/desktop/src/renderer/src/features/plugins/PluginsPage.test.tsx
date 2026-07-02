import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { InstalledPlugin } from '@shared/plugins';
import { PluginsPage } from './PluginsPage';

const PLUGINS: InstalledPlugin[] = [
  {
    id: 'com.acme.tools',
    name: 'Acme Tools',
    version: '1.2.0',
    description: 'Handy hashing nodes.',
    publisher: 'Acme',
    enabled: true,
    devMode: false,
    grantedCapabilities: ['network'],
    status: 'active',
    installedAt: 0,
    updatedAt: 0,
  },
  {
    id: 'com.broken.plugin',
    name: 'Broken Plugin',
    version: '0.1.0',
    enabled: true,
    devMode: true,
    grantedCapabilities: [],
    status: 'error',
    statusMessage: 'activate() threw: boom',
    installedAt: 0,
    updatedAt: 0,
  },
];

const MANIFEST = {
  manifestVersion: 1,
  id: 'com.acme.tools',
  name: 'Acme Tools',
  version: '2.0.0',
  description: 'Handy hashing nodes.',
  publisher: 'Acme',
  main: 'dist/index.cjs',
  engines: { sdk: '^1.0.0' },
  capabilities: ['network', 'variables:write'],
  contributes: { nodes: [], requestTypes: [], authProviders: [], importers: [] },
};

/** Minimal in-memory backend implementing the plugin IPC channels. */
function installFakeBridge(): { calls: { channel: string; req: unknown }[] } {
  const calls: { channel: string; req: unknown }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoke = async (channel: string, req: any): Promise<any> => {
    calls.push({ channel, req });
    switch (channel) {
      case 'plugins.list':
        return { plugins: PLUGINS };
      case 'plugins.contributions':
        return {
          nodes: [
            {
              pluginId: 'com.acme.tools',
              pluginName: 'Acme Tools',
              kind: 'hasher',
              label: 'Hash Body',
              configSchema: { fields: [] },
              branching: false,
            },
          ],
          requestTypes: [],
          authProviders: [],
          importers: [],
        };
      case 'plugins.inspect':
        return { manifest: MANIFEST, installedVersion: '1.2.0' };
      case 'plugins.install':
      case 'plugins.installDev':
        return { ...PLUGINS[0], version: MANIFEST.version };
      case 'plugins.setEnabled':
        return { ...PLUGINS[0], enabled: req.enabled };
      default:
        return {};
    }
  };
  (window as unknown as { workbench: unknown }).workbench = {
    invoke,
    onDispatchEvent: () => () => undefined,
    onPluginsChanged: () => () => undefined,
  };
  return { calls };
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PluginsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('<PluginsPage />', () => {
  afterEach(() => {
    delete (window as { workbench?: unknown }).workbench;
    vi.restoreAllMocks();
  });

  it('explains the requirement when no bridge is present', () => {
    renderPage();
    expect(screen.getByText(/requires the desktop runtime/i)).toBeInTheDocument();
  });

  it('lists installed plugins with status, capabilities, and contribution counts', async () => {
    installFakeBridge();
    renderPage();

    expect(await screen.findByText('Acme Tools')).toBeInTheDocument();
    expect(screen.getByText('v1.2.0')).toBeInTheDocument();
    expect(screen.getByText('· Acme')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Network access')).toBeInTheDocument();
    expect(screen.getByText(/1 node/)).toBeInTheDocument();

    // The broken plugin surfaces its status message and dev-mode chip.
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('activate() threw: boom')).toBeInTheDocument();
    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('toggles a plugin via plugins.setEnabled', async () => {
    const { calls } = installFakeBridge();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Disable Acme Tools' }));

    await waitFor(() => {
      const call = calls.find((c) => c.channel === 'plugins.setEnabled');
      expect(call?.req).toEqual({ id: 'com.acme.tools', enabled: false });
    });
  });

  it('runs the install consent flow with the selected capabilities', async () => {
    const { calls } = installFakeBridge();
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText('Plugin path'), 'C:\\plugins\\acme.awbx');
    await user.click(screen.getByRole('button', { name: /Install…/ }));

    // Consent dialog: identity, upgrade note, and default-checked capabilities.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Install plugin');
    expect(screen.getByText('com.acme.tools')).toBeInTheDocument();
    expect(screen.getByText(/already installed/i)).toBeInTheDocument();
    const network = screen.getByLabelText('Network access');
    const write = screen.getByLabelText('Write variables');
    expect(network).toBeChecked();
    expect(write).toBeChecked();

    // Withhold one capability, then confirm.
    await user.click(write);
    await user.click(screen.getByRole('button', { name: 'Upgrade' }));

    await waitFor(() => {
      const call = calls.find((c) => c.channel === 'plugins.install');
      expect(call?.req).toEqual({
        path: 'C:\\plugins\\acme.awbx',
        grantedCapabilities: ['network'],
      });
    });
  });

  it('sends load-unpacked installs through plugins.installDev', async () => {
    const { calls } = installFakeBridge();
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText('Plugin path'), 'C:\\dev\\acme');
    await user.click(screen.getByRole('button', { name: /Load unpacked/ }));
    await user.click(await screen.findByRole('button', { name: 'Upgrade' }));

    await waitFor(() => {
      const call = calls.find((c) => c.channel === 'plugins.installDev');
      expect(call?.req).toEqual({
        path: 'C:\\dev\\acme',
        grantedCapabilities: ['network', 'variables:write'],
      });
    });
  });
});
