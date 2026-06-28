import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

/** Imperative confirm: `if (await confirm({ message }))`. Requires ConfirmProvider. */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

interface PendingState {
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

/** Provides a promise-based confirm() and renders the dialog when one is pending. */
export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pending, setPending] = useState<PendingState | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );

  const settle = (result: boolean): void => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          title={pending.options.title ?? 'Are you sure?'}
          message={pending.options.message}
          {...(pending.options.confirmLabel ? { confirmLabel: pending.options.confirmLabel } : {})}
          {...(pending.options.cancelLabel ? { cancelLabel: pending.options.cancelLabel } : {})}
          {...(pending.options.danger ? { danger: true } : {})}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}
