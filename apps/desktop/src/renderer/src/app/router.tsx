import { createHashRouter } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { HomePage } from '../pages/HomePage';
import { SettingsPage } from '../pages/SettingsPage';
import { DispatchPage } from '../pages/DispatchPage';
import { WorkspacesPage } from '../features/workspaces/WorkspacesPage';
import { CollectionsPage } from '../features/collections/CollectionsPage';
import { VariablesPage } from '../features/variables/VariablesPage';
import { RequestRunnerPage } from '../features/runner/RequestRunnerPage';
import { WorkflowsPage } from '../features/workflows/WorkflowsPage';

/**
 * Hash routing is used because the renderer is loaded from a file:// URL in
 * production, where history-based routing does not resolve cleanly.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'workspaces', element: <WorkspacesPage /> },
      { path: 'collections', element: <CollectionsPage /> },
      { path: 'variables', element: <VariablesPage /> },
      { path: 'runner', element: <RequestRunnerPage /> },
      { path: 'workflows', element: <WorkflowsPage /> },
      { path: 'dispatch', element: <DispatchPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
