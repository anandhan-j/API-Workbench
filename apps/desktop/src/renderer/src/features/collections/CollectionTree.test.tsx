import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TreeNode } from '@shared/collection';
import { CollectionTree } from './CollectionTree';

const nodes: TreeNode[] = [
  { type: 'folder', id: 'f1', parentId: null, name: 'v1', depth: 0 },
  { type: 'request', id: 'r1', parentId: 'f1', name: 'list users', depth: 1, method: 'GET', url: '/users', favorite: false },
  { type: 'request', id: 'r2', parentId: null, name: 'create order', depth: 0, method: 'POST', url: '/orders', favorite: true },
];

describe('<CollectionTree />', () => {
  it('shows an empty state with no nodes', () => {
    render(<CollectionTree nodes={[]} />);
    expect(screen.getByText('This collection is empty.')).toBeInTheDocument();
  });

  it('renders folders and requests with method badges', () => {
    render(<CollectionTree nodes={nodes} height={300} />);
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('list users')).toBeInTheDocument();
    expect(screen.getByText('create order')).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('POST')).toBeInTheDocument();
  });

  it('invokes callbacks on open and favorite', async () => {
    const onOpen = vi.fn();
    const onToggleFavorite = vi.fn();
    const user = userEvent.setup();
    render(<CollectionTree nodes={nodes} height={300} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />);

    await user.click(screen.getByText('list users'));
    expect(onOpen).toHaveBeenCalledWith('r1');

    await user.click(screen.getByRole('button', { name: 'Favorite list users' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('r1');
  });
});
