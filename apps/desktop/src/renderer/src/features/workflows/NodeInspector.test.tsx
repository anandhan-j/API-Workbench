import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FlowNode } from './graph-mapping';
import { NodeInspector } from './NodeInspector';

/** Bridge stub serving a plugin node contribution with a config form. */
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
            configSchema: {
              fields: [
                { key: 'target', kind: 'string', label: 'Target' },
                {
                  key: 'algorithm',
                  kind: 'select',
                  label: 'Algorithm',
                  options: [
                    { value: 'sha256', label: 'SHA-256' },
                    { value: 'md5', label: 'MD5' },
                  ],
                },
              ],
            },
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

const pluginNode: FlowNode = {
  id: 'n1',
  type: 'workbench',
  position: { x: 0, y: 0 },
  data: {
    kind: 'plugin:com.acme.tools/hasher',
    name: 'Hash Body',
    config: { target: '{{body}}', algorithm: 'sha256' },
  },
};

function renderInspector(onConfig = vi.fn()): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <NodeInspector
        node={pluginNode}
        workflows={[]}
        onRename={vi.fn()}
        onConfig={onConfig}
        onPolicy={vi.fn()}
        onDelete={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe('<NodeInspector /> plugin nodes', () => {
  afterEach(() => {
    delete (window as { workbench?: unknown }).workbench;
  });

  it('renders the contribution form schema bound to the node config', async () => {
    installFakeBridge();
    renderInspector();

    const target = await screen.findByLabelText('Target');
    expect(target).toHaveValue('{{body}}');
    expect(screen.getByLabelText('Algorithm')).toHaveValue('sha256');
    expect(screen.getByText('From plugin: Acme Tools')).toBeInTheDocument();
  });

  it('pushes form edits up through onConfig', async () => {
    installFakeBridge();
    const onConfig = vi.fn();
    const user = userEvent.setup();
    renderInspector(onConfig);

    await user.selectOptions(await screen.findByLabelText('Algorithm'), 'md5');
    expect(onConfig).toHaveBeenCalledWith({ target: '{{body}}', algorithm: 'md5' });
  });
});
