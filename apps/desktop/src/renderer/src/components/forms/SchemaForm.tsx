import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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
          <FieldControl field={field} value={value[field.key]} onValue={(v) => set(field.key, v)} />
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
}: {
  field: FormField;
  value: unknown;
  onValue: (value: unknown) => void;
}): JSX.Element {
  const id = `sf-${field.key}`;
  switch (field.kind) {
    case 'string':
      return (
        <input
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onValue(e.target.value)}
          placeholder={field.placeholder}
          className={fieldClass}
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
          className={cn(fieldClass, field.language === 'json' && 'font-mono text-xs')}
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
          className={fieldClass}
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
          className={fieldClass}
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
          className={fieldClass}
        />
      );
    case 'keyvalue':
      return (
        <KeyValueGrid
          label={field.label}
          value={isStringRecord(value) ? value : {}}
          onChange={onValue}
        />
      );
  }
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
 */
function KeyValueGrid({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
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
    <table className="w-full rounded-md border border-border text-sm">
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
