import { Paperclip, X } from 'lucide-react';
import type { ResolvedKey } from '@shared/variable';
import { newRow, type KeyValue } from './build-request';
import { VariableField } from '../variables/VariableField';
import { pickFile, formatBytes } from '../../lib/pick-file';

export interface FormDataEditorProps {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  suggestions?: ResolvedKey[];
}

/** Ensures exactly one trailing blank row so there's always somewhere to type. */
function normalize(rows: KeyValue[]): KeyValue[] {
  const last = rows[rows.length - 1];
  if (!last || last.key || last.value || last.fileBase64) return [...rows, newRow()];
  return rows;
}

/**
 * Postman-style form-data grid. Each row can be a text field or a file: the
 * type dropdown switches between them, and file rows get a native file picker.
 */
export function FormDataEditor({ rows, onChange, suggestions = [] }: FormDataEditorProps): JSX.Element {
  const display = normalize(rows);
  const update = (id: string, patch: Partial<KeyValue>): void =>
    onChange(normalize(display.map((r) => (r.id === id ? { ...r, ...patch } : r))));
  const remove = (id: string): void => onChange(normalize(display.filter((r) => r.id !== id)));

  const choose = async (id: string): Promise<void> => {
    const file = await pickFile();
    if (file) update(id, { fileName: file.name, fileBase64: file.base64, value: formatBytes(file.size) });
  };

  const isTrailing = (i: number): boolean => i === display.length - 1;

  return (
    <table className="w-full text-sm" data-testid="form-data-editor">
      <tbody>
        {display.map((row, i) => {
          const isFile = row.kind === 'file';
          return (
            <tr key={row.id} className="border-b border-border/60">
              <td className="w-8 px-2">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  aria-label="Enabled"
                  onChange={(e) => update(row.id, { enabled: e.target.checked })}
                />
              </td>
              <td className="w-2/5">
                <input
                  value={row.key}
                  onChange={(e) => update(row.id, { key: e.target.value })}
                  placeholder="Key"
                  aria-label="Key"
                  className="w-full bg-transparent px-2 py-1.5 font-mono text-xs outline-none"
                />
              </td>
              <td className="w-24">
                <select
                  value={isFile ? 'file' : 'text'}
                  aria-label="Field type"
                  onChange={(e) =>
                    update(row.id, {
                      kind: e.target.value as 'text' | 'file',
                      // Reset the value/file when switching type.
                      value: '',
                      ...(e.target.value === 'text' ? { fileName: undefined, fileBase64: undefined } : {}),
                    })
                  }
                  className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs"
                >
                  <option value="text">Text</option>
                  <option value="file">File</option>
                </select>
              </td>
              <td>
                {isFile ? (
                  <button
                    type="button"
                    onClick={() => void choose(row.id)}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-accent hover:underline"
                  >
                    <Paperclip size={13} />
                    {row.fileName ? `${row.fileName} (${row.value})` : 'Select file'}
                  </button>
                ) : (
                  <VariableField
                    value={row.value}
                    onChange={(v) => update(row.id, { value: v })}
                    suggestions={suggestions}
                    placeholder="Value"
                    aria-label="Value"
                    className="w-full bg-transparent px-2 py-1.5 font-mono text-xs outline-none"
                  />
                )}
              </td>
              <td className="w-8 px-1">
                {!isTrailing(i) && (
                  <button type="button" aria-label="Remove row" onClick={() => remove(row.id)}>
                    <X size={13} className="text-muted hover:text-danger" />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
