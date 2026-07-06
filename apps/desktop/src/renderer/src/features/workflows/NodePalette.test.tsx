import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NodePalette } from './NodePalette';

/** Bridge stub whose only job is serving the plugin contribution index. */
function installFakeBridge(): void {
  const invoke = async (channel: string): Promise<unknown> => {
    if (channel === 'plugins.contributions') {
      return {
        nodes: [
          {
            pluginId: 'com.acme.tools',
            pluginName: 'Acme Tools',
            kind: 'hasher',
            label: 'Hash Body',
            description: 'Hashes a value.',
            icon: 'hash',
            configSchema: { fields: [] },
            branching: false,
          },
          {
            pluginId: 'com.acme.tools',
            pluginName: 'Acme Tools',
            kind: 'notify',
            label: 'Send Notification',
            configSchema: { fields: [] },
            branching: false,
          },
        ],
        requestTypes: [],
        authProviders: [],
        importers: [],
      };
    }
    return {};
  };
  (window as unknown as { workbench: unknown }).workbench = {
    invoke,
    onDispatchEvent: () => () => undefined,
    onPluginsChanged: () => () => undefined,
  };
}

function renderPalette(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <NodePalette />
    </QueryClientProvider>,
  );
}

describe('<NodePalette />', () => {
  afterEach(() => {
    delete (window as { workbench?: unknown }).workbench;
  });

  it('lists only built-in nodes when no plugins contribute', () => {
    renderPalette();
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.queryByText('Plugins')).not.toBeInTheDocument();
  });

  it('lists plugin node contributions in a Plugins section', async () => {
    installFakeBridge();
    renderPalette();

    expect(await screen.findByText('Plugins')).toBeInTheDocument();
    expect(screen.getByText('Hash Body')).toBeInTheDocument();
    expect(screen.getByText('Send Notification')).toBeInTheDocument();
    // Built-ins are unaffected.
    expect(screen.getByText('Request')).toBeInTheDocument();

    // Plugin chips are draggable like the built-in ones.
    expect(screen.getByText('Hash Body').closest('[draggable]')).not.toBeNull();
  });
});
