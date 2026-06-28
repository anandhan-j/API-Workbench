import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspacesPage } from './WorkspacesPage';

/** Minimal in-memory backend implementing the workspace IPC channels. */
function installFakeBridge(): void {
  interface Ws {
    id: string;
    name: string;
    settings: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }
  interface Pr {
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
  }
  const wss: Ws[] = [];
  const projects: Pr[] = [];
  const recents: Array<{ projectId: string; workspaceId: string; name: string; openedAt: number }> = [];
  let activeWs: string | null = null;
  let activeProj: string | null = null;
  let counter = 0;
  const nid = (): string => `id${++counter}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoke = async (channel: string, req: any): Promise<any> => {
    switch (channel) {
      case 'workspace.list':
        return wss.map((w) => ({ ...w }));
      case 'workspace.create': {
        const w: Ws = { id: nid(), name: req.name, settings: req.settings ?? {}, createdAt: 0, updatedAt: 0 };
        wss.push(w);
        return w;
      }
      case 'workspace.getActive':
        return { workspaceId: activeWs, projectId: activeProj };
      case 'workspace.setActive':
        activeWs = req.id;
        return {};
      case 'workspace.detail': {
        const workspace = wss.find((w) => w.id === req.id);
        return { workspace, projects: projects.filter((p) => p.workspaceId === req.id) };
      }
      case 'project.create': {
        const p: Pr = { id: nid(), workspaceId: req.workspaceId, name: req.name, createdAt: 0, updatedAt: 0 };
        projects.push(p);
        return p;
      }
      case 'project.open':
        activeProj = req.id;
        return {};
      case 'project.recent':
        return recents;
      default:
        return {};
    }
  };

  (window as unknown as { workbench: unknown }).workbench = {
    invoke,
    onDispatchEvent: () => () => undefined,
  };
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <WorkspacesPage />
    </QueryClientProvider>,
  );
}

describe('<WorkspacesPage />', () => {
  afterEach(() => {
    delete (window as { workbench?: unknown }).workbench;
  });

  it('explains the requirement when no bridge is present', () => {
    renderPage();
    expect(screen.getByText(/requires the desktop database/i)).toBeInTheDocument();
  });

  it('creates a workspace, activates it, and adds a project', async () => {
    installFakeBridge();
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('No workspaces yet.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('New workspace name'), 'My Workspace');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    const wsButton = await screen.findByText('My Workspace');
    await user.click(wsButton);

    expect(await screen.findByText('No projects in this workspace.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('New project name'), 'API');
    await user.click(screen.getByRole('button', { name: /Project/ }));

    await waitFor(() => expect(screen.getByText('API')).toBeInTheDocument());
  });
});
