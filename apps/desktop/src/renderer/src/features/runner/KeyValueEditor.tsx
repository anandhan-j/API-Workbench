import { X } from 'lucide-react';
import type { ResolvedKey } from '@shared/variable';
import { newRow, type KeyValue } from './build-request';
import { VariableField } from '../variables/VariableField';

export interface KeyValueEditorProps {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  suggestions?: ResolvedKey[];
}

/** Ensures exactly one trailing blank row so there's always somewhere to type. */
function normalize(rows: KeyValue[]): KeyValue[] {
  const last = rows[rows.length - 1];
  if (!last || last.key || last.value) return [...rows, newRow()];
  return rows;
}

/** Postman-style editable key/value grid with enable toggles and row removal. */
export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  suggestions = [],
}: KeyValueEditorProps): JSX.Element {
  const update = (id: string, patch: Partial<KeyValue>): void =>
    onChange(normalize(rows.map((r) => (r.id === id ? { ...r, ...patch } : r))));
  const remove = (id: string): void => onChange(normalize(rows.filter((r) => r.id !== id)));

  const display = normalize(rows);
  const isTrailing = (i: number): boolean => i === display.length - 1;

  return (
    <table className="w-full text-sm" data-testid="kv-editor">
      <tbody>
        {display.map((row, i) => (
          <tr key={row.id} className="border-b border-border/60">
            <td className="w-8 px-2">
              <input
                type="checkbox"
                checked={row.enabled}
                aria-label="Enabled"
                onChange={(e) => update(row.id, { enabled: e.target.checked })}
              />
            </td>
            <td className="w-1/2">
              <input
                value={row.key}
                onChange={(e) => update(row.id, { key: e.target.value })}
                placeholder={keyPlaceholder}
                aria-label={keyPlaceholder}
                className="w-full bg-transparent px-2 py-1.5 font-mono text-xs outline-none"
              />
            </td>
            <td>
              <VariableField
                value={row.value}
                onChange={(v) => update(row.id, { value: v })}
                suggestions={suggestions}
                placeholder={valuePlaceholder}
                aria-label={valuePlaceholder}
                className="w-full bg-transparent px-2 py-1.5 font-mono text-xs outline-none"
              />
            </td>
            <td className="w-8 px-1">
              {!isTrailing(i) && (
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
