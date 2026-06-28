import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CollectionVersion, VersionDiff } from '@shared/version';
import { VersionsPanel } from './VersionsPanel';

function makeVersion(over: Partial<CollectionVersion> = {}): CollectionVersion {
  return {
    id: 'v-1',
    collectionId: 'c1',
    number: 1,
    label: 'baseline',
    checksum: 'abcdef0123456789',
    createdAt: 1_700_000_000_000,
    counts: { folders: 2, requests: 5 },
    ...over,
  };
}

describe('<VersionsPanel />', () => {
  it('snapshots with a label', async () => {
    const onSnapshot = vi.fn();
    const user = userEvent.setup();
    render(
      <VersionsPanel
        versions={[]}
        onSnapshot={onSnapshot}
        onRestore={vi.fn()}
        onDiff={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Snapshot label'), { target: { value: 'before edit' } });
    await user.click(screen.getByRole('button', { name: 'Snapshot' }));
    expect(onSnapshot).toHaveBeenCalledWith('before edit');
  });

  it('shows an empty state when there are no versions', () => {
    render(<VersionsPanel versions={[]} onSnapshot={vi.fn()} onRestore={vi.fn()} onDiff={vi.fn()} />);
    expect(screen.getByText(/No versions yet/)).toBeInTheDocument();
  });

  it('lists versions with counts and restores one', async () => {
    const onRestore = vi.fn();
    const user = userEvent.setup();
    render(
      <VersionsPanel
        versions={[makeVersion()]}
        onSnapshot={vi.fn()}
        onRestore={onRestore}
        onDiff={vi.fn()}
      />,
    );
    expect(screen.getByText(/v1 · baseline/)).toBeInTheDocument();
    expect(screen.getByText(/2 folders, 5 requests/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore v1' }));
    expect(onRestore).toHaveBeenCalledWith('v-1');
  });

  it('renders a diff summary against the current state', () => {
    const diff: VersionDiff = {
      fromVersionId: 'v-1',
      toVersionId: null,
      addedRequests: [{ id: 'a', name: 'A', method: 'GET', url: '/a' }],
      removedRequests: [],
      modifiedRequests: [{ id: 'b', name: 'B', changes: [] }],
      addedFolders: [],
      removedFolders: [],
    };
    render(
      <VersionsPanel
        versions={[makeVersion()]}
        diff={{ versionId: 'v-1', data: diff }}
        onSnapshot={vi.fn()}
        onRestore={vi.fn()}
        onDiff={vi.fn()}
      />,
    );
    expect(screen.getByText(/1 added/)).toBeInTheDocument();
    expect(screen.getByText(/1 modified/)).toBeInTheDocument();
  });
});
