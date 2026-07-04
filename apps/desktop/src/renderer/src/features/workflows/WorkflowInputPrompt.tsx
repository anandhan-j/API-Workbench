import { useMemo, useState } from 'react';
import { FormInput } from 'lucide-react';
import type { UserInputField, WorkflowInputRequest } from '@shared/workflow';
import type { FormField, FormSchema } from '@shared/forms';
import { Modal } from '../../components/menu/Modal';
import { SchemaForm } from '../../components/forms/SchemaForm';

interface WorkflowInputPromptProps {
  request: WorkflowInputRequest;
  /** Submit the collected values, resuming the run. */
  onSubmit: (values: Record<string, string>) => void;
  /** Cancel the prompt; the node fails and the run unwinds. */
  onCancel: () => void;
}

/**
 * Modal shown while a run is suspended at a user-input node. Each field's
 * `kind` picks its control; the whole prompt is drawn by {@link SchemaForm}
 * (the same renderer plugin config forms use). Defaults arrive already
 * template-evaluated. Runtime variables are strings, so submission serializes:
 * numbers/booleans to their string form, `list`/`keyvalue` to JSON.
 */
export function WorkflowInputPrompt({
  request,
  onSubmit,
  onCancel,
}: WorkflowInputPromptProps): JSX.Element {
  const schema = useMemo<FormSchema>(
    () => ({ fields: request.fields.map(toFormField) }),
    [request],
  );
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(request.fields.map((f) => [f.variable, initialValue(f)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (next: Record<string, unknown>): void => {
    setValues(next);
    // After a failed submit, errors clear live as their fields are filled.
    if (Object.keys(errors).length > 0) setErrors(missingRequired(request.fields, next));
  };

  return (
    <Modal title={request.name || 'User input'} onClose={onCancel} maxWidth="max-w-md">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const missing = missingRequired(request.fields, values);
          if (Object.keys(missing).length > 0) return setErrors(missing);
          onSubmit(
            Object.fromEntries(
              request.fields.map((f) => [f.variable, serializeValue(f, values[f.variable])]),
            ),
          );
        }}
      >
        <p className="flex items-center gap-2 text-sm text-muted">
          <FormInput size={15} className="shrink-0 text-orange-400" />
          {request.message || 'The workflow is paused, waiting for your input.'}
        </p>

        <SchemaForm schema={schema} value={values} onChange={handleChange} errors={errors} />

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

/** Maps a prompt field onto the generic form renderer's field language. */
function toFormField(field: UserInputField): FormField {
  const base = {
    key: field.variable,
    label: field.label || field.variable,
    required: field.required,
    substituteVariables: true,
  };
  switch (fieldKind(field)) {
    case 'secret':
      return { ...base, kind: 'secret' };
    case 'number':
      return { ...base, kind: 'number', integer: false };
    case 'boolean':
      return { ...base, kind: 'boolean' };
    case 'select':
      return { ...base, kind: 'select', options: dropdownOptions(field) };
    case 'list':
      return { ...base, kind: 'list' };
    case 'keyvalue':
      return { ...base, kind: 'keyvalue' };
    case 'string':
      return { ...base, kind: 'string' };
  }
}

/** Seeds a field's control from its (already evaluated) string default. */
function initialValue(field: UserInputField): unknown {
  switch (fieldKind(field)) {
    case 'number': {
      const n = Number(field.default);
      return field.default.trim() !== '' && Number.isFinite(n) ? n : undefined;
    }
    case 'boolean':
      return field.default.trim().toLowerCase() === 'true';
    case 'select': {
      // A dropdown must submit one of its choices; fall back to the first
      // when the default is absent from (or empty for) the list.
      const values = dropdownOptions(field).map((o) => o.value);
      return values.includes(field.default) ? field.default : (values[0] ?? '');
    }
    case 'list':
      return parseJsonStringArray(field.default);
    case 'keyvalue':
      return parseJsonStringRecord(field.default);
    default:
      return field.default;
  }
}

/**
 * Required-field validation: a field is missing when it is required and its
 * control holds nothing — an empty/blank string, no number, an empty list or
 * grid. Booleans always hold a value, so `required` never blocks them.
 */
function missingRequired(
  fields: UserInputField[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!field.required) continue;
    const value = values[field.variable];
    let empty: boolean;
    switch (fieldKind(field)) {
      case 'boolean':
        empty = false;
        break;
      case 'number':
        empty = typeof value !== 'number';
        break;
      case 'list':
        empty = !Array.isArray(value) || value.length === 0;
        break;
      case 'keyvalue':
        empty =
          !value || typeof value !== 'object' || Object.keys(value as object).length === 0;
        break;
      default:
        empty = typeof value !== 'string' || value.trim() === '';
        break;
    }
    if (empty) errors[field.variable] = 'This field is required.';
  }
  return errors;
}

/** What the prompt draws; run-time-filled selects render the growable list. */
type RenderKind = UserInputField['kind'] | 'list';

/**
 * The control actually rendered. `select`/`keyvalue` are dropdowns of their
 * presets unless `filledAtRuntime` asks for the growable list / grid editor;
 * a dropdown with nothing to choose from degrades sensibly (`select` to a
 * plain text input, `keyvalue` to the run-time grid).
 */
function fieldKind(field: UserInputField): RenderKind {
  switch (field.kind) {
    case 'select':
      if (field.filledAtRuntime) return 'list';
      return field.options.length > 0 ? 'select' : 'string';
    case 'keyvalue':
      if (field.filledAtRuntime) return 'keyvalue';
      return Object.keys(field.entries).length > 0 ? 'select' : 'keyvalue';
    default:
      return field.kind;
  }
}

/**
 * A dropdown's choices: preset keyvalue entries show their key as the label
 * and store the value; `select` and preset list items store the item itself.
 */
function dropdownOptions(field: UserInputField): Array<{ value: string; label: string }> {
  return field.kind === 'keyvalue'
    ? Object.entries(field.entries).map(([key, value]) => ({ value, label: key }))
    : field.options.map((option) => ({ value: option, label: option }));
}

/** Runtime variables are strings: numbers/booleans stringify, structures go JSON. */
function serializeValue(field: UserInputField, value: unknown): string {
  switch (fieldKind(field)) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
    case 'boolean':
      return value === true ? 'true' : 'false';
    case 'list':
      return JSON.stringify(Array.isArray(value) ? value : []);
    case 'keyvalue':
      return JSON.stringify(
        value && typeof value === 'object' && !Array.isArray(value) ? value : {},
      );
    default:
      return typeof value === 'string' ? value : '';
  }
}

function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonStringRecord(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]))
      : {};
  } catch {
    return {};
  }
}
