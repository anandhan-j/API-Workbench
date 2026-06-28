import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CredentialMeta } from '@shared/auth';
import { CredentialsPanel } from './CredentialsPanel';

const creds: CredentialMeta[] = [
  { id: 'a', scope: 'workspace', scopeId: 'w1', name: 'Prod', type: 'bearer', createdAt: 0, updatedAt: 0 },
];

describe('<CredentialsPanel />', () => {
  it('lists existing credentials without exposing secrets', () => {
    render(<CredentialsPanel scope="workspace" scopeId="w1" credentials={creds} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Prod')).toBeInTheDocument();
    expect(screen.getByText('(bearer)')).toBeInTheDocument();
  });

  it('saves a new bearer credential', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<CredentialsPanel scope="workspace" scopeId="w1" credentials={[]} onSave={onSave} onDelete={vi.fn()} />);

    await user.type(screen.getByLabelText('Credential name'), 'Staging');
    await user.type(screen.getByLabelText('Bearer token'), 'tok123');
    await user.click(screen.getByRole('button', { name: 'Save credential' }));

    expect(onSave).toHaveBeenCalledWith({
      scope: 'workspace',
      scopeId: 'w1',
      name: 'Staging',
      config: { type: 'bearer', token: 'tok123' },
    });
  });

  it('saves an API key credential', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<CredentialsPanel scope="workspace" scopeId="w1" credentials={[]} onSave={onSave} onDelete={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Credential type'), 'apiKey');
    await user.type(screen.getByLabelText('Credential name'), 'Key');
    await user.type(screen.getByLabelText('API key name'), 'X-Api-Key');
    await user.type(screen.getByLabelText('API key value'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Save credential' }));

    expect(onSave).toHaveBeenCalledWith({
      scope: 'workspace',
      scopeId: 'w1',
      name: 'Key',
      config: { type: 'apiKey', key: 'X-Api-Key', value: 'secret', in: 'header' },
    });
  });

  it('deletes a credential', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<CredentialsPanel scope="workspace" scopeId="w1" credentials={creds} onSave={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: 'Delete Prod' }));
    expect(onDelete).toHaveBeenCalledWith('a');
  });
});
