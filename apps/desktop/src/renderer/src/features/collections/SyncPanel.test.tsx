import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SyncResult } from '@shared/sync';
import { SyncPanel } from './SyncPanel';

describe('<SyncPanel />', () => {
  it('submits the spec with the chosen mode', async () => {
    const onSync = vi.fn();
    const user = userEvent.setup();
    render(<SyncPanel onSync={onSync} />);

    fireEvent.change(screen.getByLabelText('Updated OpenAPI document'), {
      target: { value: '{"openapi":"3.0.0"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await user.click(screen.getByRole('button', { name: 'Synchronize' }));

    expect(onSync).toHaveBeenCalledWith({
      mode: 'replace',
      source: { type: 'text', content: '{"openapi":"3.0.0"}' },
    });
  });

  it('defaults to safe merge', async () => {
    const onSync = vi.fn();
    const user = userEvent.setup();
    render(<SyncPanel onSync={onSync} />);
    fireEvent.change(screen.getByLabelText('Updated OpenAPI document'), { target: { value: 'x' } });
    await user.click(screen.getByRole('button', { name: 'Synchronize' }));
    expect(onSync).toHaveBeenCalledWith({ mode: 'safe', source: { type: 'text', content: 'x' } });
  });

  it('renders a sync result summary', () => {
    const result: SyncResult = {
      collectionId: 'c1',
      mode: 'safe',
      added: 2,
      updated: 1,
      removed: 3,
      conflicts: 1,
      preserved: 1,
      unchanged: 5,
      changes: [],
    };
    render(<SyncPanel onSync={vi.fn()} result={result} />);
    expect(screen.getByText(/2 added/)).toBeInTheDocument();
    expect(screen.getByText(/3 removed/)).toBeInTheDocument();
    expect(screen.getByText(/1 conflicts/)).toBeInTheDocument();
  });
});
