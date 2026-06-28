import { Component, type ErrorInfo, type ReactNode } from 'react';
import { invoke, isBridgeAvailable } from '../lib/ipc';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. A render fault degrades to a recoverable panel
 * instead of a blank window, and the error is forwarded to the unified dispatch
 * log in the main process when the bridge is available.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isBridgeAvailable()) {
      void invoke('dispatch.emit', {
        level: 'error',
        source: 'error-boundary',
        message: error.message,
        context: { stack: info.componentStack ?? undefined },
      }).catch(() => undefined);
    }
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center bg-bg p-8">
        <div className="max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
          <h1 className="text-lg font-semibold text-danger">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">{error.message}</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
