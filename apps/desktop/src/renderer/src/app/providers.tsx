import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUiStore } from '../stores/ui-store';
import { ConfirmProvider } from '../components/confirm/ConfirmProvider';
import { ToastProvider } from '../components/toast/ToastProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
  },
});

/** Applies the active theme class to the document root. */
function ThemeController(): null {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(`theme-${theme}`);
  }, [theme]);
  return null;
}

/** Applies the chosen font scale to the document root (scales rem-based text). */
function FontController(): null {
  const fontScale = useUiStore((s) => s.fontScale);
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 16}px`;
  }, [fontScale]);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeController />
      <FontController />
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
