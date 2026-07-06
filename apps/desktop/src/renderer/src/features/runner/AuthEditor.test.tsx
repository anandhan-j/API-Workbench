import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthEditor } from './AuthEditor';
import type { EditorAuthConfig } from './build-request';

/** Bridge stub serving one plugin auth provider contribution. */
function installFakeBridge(): void {
  const invoke = async (channel: string): Promise<unknown> => {
    if (channel === 'plugins.contributions') {
      return {
        nodes: [],
        requestTypes: [],
        authProviders: [
          {
            pluginId: 'com.acme.tools',
            pluginName: 'Acme Tools',
            type: 'hmac',
            label: 'HMAC Signature',
            configSchema: {
              fields: [
                { key: 'secret', kind: 'secret', label: 'Signing secret' },
                {
                  key: 'algorithm',
                  kind: 'select',
                  label: 'Algorithm',
                  options: [
                    { value: 'sha256', label: 'SHA-256' },
                    { value: 'sha512', label: 'SHA-512' },
                  ],
                },
              ],
            },
          },
        ],
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

function renderEditor(auth: EditorAuthConfig, onChange = vi.fn()): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <AuthEditor auth={auth} onChange={onChange} />
    </QueryClientProvider>,
  );
}

describe('<AuthEditor /> plugin providers', () => {
  afterEach(() => {
    delete (window as { workbench?: unknown }).workbench;
  });

  it('shows only built-in schemes without plugin contributions', () => {
    renderEditor({ type: 'none' });
    const options = screen
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['none', 'bearer', 'basic', 'apiKey', 'oauth2']);
  });

  it('offers plugin providers and seeds their config from form defaults', async () => {
    installFakeBridge();
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderEditor({ type: 'none' }, onChange);

    expect(await screen.findByRole('option', { name: 'HMAC Signature' })).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText('Auth type'),
      'plugin:com.acme.tools/hmac',
    );
    expect(onChange).toHaveBeenCalledWith({
      type: 'plugin:com.acme.tools/hmac',
      secret: '',
      algorithm: 'sha256',
    });
  });

  it('renders the provider form schema for a selected plugin type', async () => {
    installFakeBridge();
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderEditor(
      { type: 'plugin:com.acme.tools/hmac', secret: 'shh', algorithm: 'sha512' },
      onChange,
    );

    const secret = await screen.findByLabelText('Signing secret');
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveValue('shh');
    expect(screen.getByLabelText('Algorithm')).toHaveValue('sha512');
    expect(screen.getByText('From plugin: Acme Tools')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Algorithm'), 'sha256');
    expect(onChange).toHaveBeenCalledWith({
      type: 'plugin:com.acme.tools/hmac',
      secret: 'shh',
      algorithm: 'sha256',
    });
  });
});
