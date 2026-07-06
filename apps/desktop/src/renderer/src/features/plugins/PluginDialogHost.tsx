import { useEffect, useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { PluginDialogRequest } from '@shared/plugins';
import { compileFormSchemaToZod, formDefaults } from '@shared/forms';
import { Modal } from '../../components/menu/Modal';
import { SchemaForm } from '../../components/forms/SchemaForm';
import { invoke, onPluginDialogRequest } from '../../lib/ipc';

/**
 * Global host for plugin-requested dialogs (`ui:dialog` capability, ADR-0010).
 * The main process pushes `plugin.dialogRequest` events while a plugin awaits
 * `ctx.ui.showDialog`; this renders them one at a time with the trusted
 * Modal + SchemaForm pair — plugin code never runs here — and replies on
 * `plugin.dialogRespond`. The provenance line always names the plugin so a
 * dialog can't pass itself off as host UI.
 */
export function PluginDialogHost(): JSX.Element | null {
  const [queue, setQueue] = useState<PluginDialogRequest[]>([]);

  useEffect(() => {
    return onPluginDialogRequest((request) => setQueue((q) => [...q, request]));
  }, []);

  const current = queue[0];
  if (!current) return null;

  const settle = (values: Record<string, unknown>, cancelled: boolean): void => {
    invoke('plugin.dialogRespond', { dialogId: current.dialogId, values, cancelled }).catch(
      () => undefined, // bridge absent outside Electron; nothing to settle
    );
    setQueue((q) => q.slice(1));
  };

  return (
    <PluginDialog
      // Remount per request so form state never leaks between dialogs.
      key={current.dialogId}
      request={current}
      onSubmit={(values) => settle(values, false)}
      onCancel={() => settle({}, true)}
    />
  );
}

function PluginDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: PluginDialogRequest;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}): JSX.Element {
  const [values, setValues] = useState<Record<string, unknown>>(() => formDefaults(request.form));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (): void => {
    const parsed = compileFormSchemaToZod(request.form).safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <Modal title={request.title || request.pluginName} onClose={onCancel} maxWidth="max-w-md">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="flex items-center gap-2 text-[11px] text-muted">
          <Puzzle size={13} className="shrink-0" />
          Shown by the plugin “{request.pluginName}”
        </p>
        {request.message && <p className="text-sm text-fg">{request.message}</p>}

        {request.form.fields.length > 0 && (
          <SchemaForm schema={request.form} value={values} onChange={setValues} errors={errors} />
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-2"
          >
            {request.cancelLabel}
          </button>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg">
            {request.okLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
