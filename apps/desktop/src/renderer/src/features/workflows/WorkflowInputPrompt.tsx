import { useState } from 'react';
import { FormInput } from 'lucide-react';
import type { WorkflowInputRequest } from '@shared/workflow';
import { Modal } from '../../components/menu/Modal';

const fieldClass =
  'w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent';
const labelClass = 'block text-[11px] font-medium uppercase tracking-wide text-muted';

interface WorkflowInputPromptProps {
  request: WorkflowInputRequest;
  /** Submit the collected values, resuming the run. */
  onSubmit: (values: Record<string, string>) => void;
  /** Cancel the prompt; the node fails and the run unwinds. */
  onCancel: () => void;
}

/**
 * Modal shown while a run is suspended at a user-input node. Seeds each field
 * from its (already evaluated) default and submits the collected values back to
 * the engine via `workflow.provideInput`.
 */
export function WorkflowInputPrompt({
  request,
  onSubmit,
  onCancel,
}: WorkflowInputPromptProps): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.fields.map((f) => [f.variable, f.default])),
  );

  return (
    <Modal title={request.name || 'User input'} onClose={onCancel} maxWidth="max-w-md">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(values);
        }}
      >
        <p className="flex items-center gap-2 text-sm text-muted">
          <FormInput size={15} className="shrink-0 text-orange-400" />
          {request.message || 'The workflow is paused, waiting for your input.'}
        </p>

        {request.fields.map((field) => (
          <div key={field.variable}>
            <label className={labelClass} htmlFor={`wf-input-${field.variable}`}>
              {field.label || field.variable}
            </label>
            <input
              id={`wf-input-${field.variable}`}
              type={field.secret ? 'password' : 'text'}
              value={values[field.variable] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.variable]: e.target.value }))}
              className={fieldClass}
              autoComplete="off"
            />
          </div>
        ))}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-2"
          >
            Cancel
          </button>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg">
            Continue
          </button>
        </div>
      </form>
    </Modal>
  );
}
