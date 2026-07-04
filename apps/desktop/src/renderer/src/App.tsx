import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { ErrorBoundary } from './app/error-boundary';
import { router } from './app/router';
import { PluginDialogHost } from './features/plugins/PluginDialogHost';

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
        <PluginDialogHost />
      </AppProviders>
    </ErrorBoundary>
  );
}
