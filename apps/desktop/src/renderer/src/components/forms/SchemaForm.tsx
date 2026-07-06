import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { FormField, FormSchema } from '@shared/forms';
import { cn } from '../../lib/cn';

/**
 * Generic renderer for a plugin-declared {@link FormSchema} (ADR-0007). Plugin
 * config UIs (node config, auth config, request-type payloads) are pure data —
 * this draws every field kind with the app's standard input styles and reports
 * the value object upward. No plugin code runs here.
 */
export interface SchemaFormProps {
  schema: FormSchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Field-level validation errors keyed by field key. */
  errors?: Record<string, string>;
}

const fieldClass =
  'w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent';
const labelClass = 'block text-[11px] font-medium uppercase tracking-wide text-muted';

export function SchemaForm({ schema, value, onChange, errors = {} }: SchemaFormProps): JSX.Element {
  const set = (key: string, fieldValue: unknown): void => onChange({ ...value, [key]: fieldValue });

  return (
    <div className="flex flex-col gap-3">
      {schema.fields.map((field) => (
        <div key={field.key}>
          <label className={labelClass} htmlFor={`sf-${field.key}`}>
            {field.label}
            {field.required && <span className="ml-0.5 text-rose-400">*</span>}
          </label>
          <FieldControl
            field={field}
            value={value[field.key]}
            onValue={(v) => set(field.key, v)}
            invalid={Boolean(errors[field.key])}
          />
          {field.description && <p className="mt-1 text-[11px] text-muted">{field.description}</p>}
          {errors[field.key] && <p className="mt-1 text-[11px] text-danger">{errors[field.key]}</p>}
        </div>
      ))}
      {schema.fields.length === 0 && (
        <p className="text-sm text-muted">This form has no options.</p>
      )}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onValue,
  invalid = false,
}: {
  field: FormField;
  value: unknown;
  onValue: (value: unknown) => void;
  /** Draws the control's border in the danger color (failed validation). */
  invalid?: boolean;
}): JSX.Element {
  const id = `sf-${field.key}`;
  const controlClass = cn(fieldClass, invalid && 'border-danger');
  switch (field.kind) {
    case 'string':
      return (
        <input
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onValue(e.target.value)}
          placeholder={field.placeholder}
          className={controlClass}
        />
      );
    case 'textarea':
      return (
        <textarea
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onValue(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={cn(controlClass, field.language === 'json' && 'font-mono text-xs')}
        />
      );
    case 'number':
      return (
        <input
          id={id}
          type="number"
          value={typeof value === 'number' ? value : ''}
          {...(field.min !== undefined ? { min: field.min } : {})}
          {...(field.max !== undefined ? { max: field.max } : {})}
          {...(field.integer ? { step: 1 } : {})}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onValue(undefined);
            const n = field.integer ? Math.trunc(Number(raw)) : Number(raw);
            onValue(Number.isNaN(n) ? undefined : n);
          }}
          className={controlClass}
        />
      );
    case 'boolean':
      return (
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onValue(e.target.checked)}
          className="mt-1 block"
        />
      );
    case 'select':
      return (
        <select
          id={id}
          value={typeof value === 'string' ? value : (field.options[0]?.value ?? '')}
          onChange={(e) => onValue(e.target.value)}
          className={controlClass}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'secret':
      return (
        <input
          id={id}
          type="password"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onValue(e.target.value)}
          autoComplete="off"
          className={controlClass}
        />
      );
    case 'list':
      return (
        <StringListEditor
          label={field.label}
          value={isStringArray(value) ? value : []}
          placeholder={field.placeholder}
          maxItems={field.maxItems}
          onChange={onValue}
          invalid={invalid}
        />
      );
    case 'keyvalue':
      return (
        <KeyValueGrid
          label={field.label}
          value={isStringRecord(value) ? value : {}}
          onChange={onValue}
          invalid={invalid}
        />
      );
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

interface ListRow {
  id: string;
  value: string;
}

function listToRows(items: string[]): ListRow[] {
  return items.map((item) => ({ id: crypto.randomUUID(), value: item }));
}

function rowsToItems(rows: ListRow[]): string[] {
  return rows.map((r) => r.value).filter((v) => v.trim() !== '');
}

/**
 * Editor for `list` fields: one input row per item with a remove button and an
 * explicit "Add item" action. Rows live in local state (same pattern as
 * {@link KeyValueGrid}) so a just-added empty row isn't collapsed by the
 * committed array round-trip; empty items are dropped from the value pushed up.
 *
 * Exported for reuse by built-in editors that hold a `string[]` (e.g. the
 * switch node's cases in the workflow inspector).
 */
export function StringListEditor({
  label,
  value,
  placeholder,
  maxItems,
  onChange,
  invalid = false,
}: {
  label: string;
  value: string[];
  placeholder?: string;
  maxItems?: number;
  onChange: (next: string[]) => void;
  /** Draws the editor in the danger color (failed validation). */
  invalid?: boolean;
}): JSX.Element {
  const [rows, setRows] = useState<ListRow[]>(() => listToRows(value));

  useEffect(() => {
    setRows((current) =>
      JSON.stringify(rowsToItems(current)) === JSON.stringify(value) ? current : listToRows(value),
    );
  }, [value]);

  const commit = (next: ListRow[]): void => {
    setRows(next);
    onChange(rowsToItems(next));
  };
  const add = (): void => commit([...rows, { id: crypto.randomUUID(), value: '' }]);
  const update = (id: string, item: string): void =>
    commit(rows.map((r) => (r.id === id ? { ...r, value: item } : r)));
  const remove = (id: string): void => commit(rows.filter((r) => r.id !== id));

  const atCapacity = maxItems !== undefined && rows.length >= maxItems;

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <input
            value={row.value}
            onChange={(e) => update(row.id, e.target.value)}
            placeholder={placeholder}
            aria-label={`${label} item ${i + 1}`}
            className={cn(fieldClass, invalid && 'border-danger')}
          />
          <button
            type="button"
            aria-label={`Remove ${label} item ${i + 1}`}
            onClick={() => remove(row.id)}
          >
            <X size={13} className="text-muted hover:text-danger" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={atCapacity}
        className={cn(
          'flex w-fit items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted hover:border-accent hover:text-fg',
          invalid ? 'border-danger' : 'border-border',
          atCapacity && 'cursor-not-allowed opacity-50',
        )}
      >
        <Plus size={12} />
        Add item
      </button>
    </div>
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface KvRow {
  id: string;
  key: string;
  value: string;
}

function rowsToRecord(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.trim()) out[row.key.trim()] = row.value;
  }
  return out;
}

function recordToRows(record: Record<string, string>): KvRow[] {
  return Object.entries(record).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value: String(value),
  }));
}

/** Ensures exactly one trailing blank row so there's always somewhere to type. */
function normalize(rows: KvRow[]): KvRow[] {
  const last = rows[rows.length - 1];
  if (!last || last.key || last.value) {
    return [...rows, { id: crypto.randomUUID(), key: '', value: '' }];
  }
  return rows;
}

/**
 * String→string grid for `keyvalue` fields, following the headers editor
 * pattern. Rows live in local state so an in-progress key edit isn't collapsed
 * by the record round-trip; the built record is pushed up on change and local
 * rows resync only when the value changes from outside.
 *
 * Exported for reuse by built-in editors that hold a string→string record
 * (e.g. the user-input node's pre-defined keyvalue entries).
 */
export function KeyValueGrid({
  label,
  value,
  onChange,
  invalid = false,
}: {
  label: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Draws the grid's border in the danger color (failed validation). */
  invalid?: boolean;
}): JSX.Element {
  const [rows, setRows] = useState<KvRow[]>(() => normalize(recordToRows(value)));

  useEffect(() => {
    setRows((current) =>
      JSON.stringify(rowsToRecord(current)) === JSON.stringify(value)
        ? current
        : normalize(recordToRows(value)),
    );
  }, [value]);

  const commit = (next: KvRow[]): void => {
    const normalized = normalize(next);
    setRows(normalized);
    onChange(rowsToRecord(normalized));
  };
  const update = (id: string, patch: Partial<KvRow>): void =>
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string): void => commit(rows.filter((r) => r.id !== id));

  return (
    <table
      className={cn('w-full rounded-md border text-sm', invalid ? 'border-danger' : 'border-border')}
    >
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id} className="border-b border-border/60 last:border-0">
            <td className="w-1/2">
              <input
                value={row.key}
                onChange={(e) => update(row.id, { key: e.target.value })}
                placeholder="Key"
                aria-label={`${label} key`}
                className="w-full bg-transparent px-2 py-1.5 font-mono text-xs outline-none"
              />
            </td>
            <td>
              <input
                value={row.value}
                onChange={(e) => update(row.id, { value: e.target.value })}
                placeholder="Value"
                aria-label={`${label} value`}
                className="w-full bg-transparent px-2 py-1.5 font-mono text-xs outline-none"
              />
            </td>
            <td className="w-8 px-1">
              {i !== rows.length - 1 && (
                <button type="button" aria-label="Remove row" onClick={() => remove(row.id)}>
                  <X size={13} className="text-muted hover:text-danger" />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
