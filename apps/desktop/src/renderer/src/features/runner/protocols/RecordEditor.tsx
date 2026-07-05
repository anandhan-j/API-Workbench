import { useState } from 'react';
import type { VariableSuggestion } from '../../variables/suggestion';
import { KeyValueEditor } from '../KeyValueEditor';
import { newRow, type KeyValue } from '../build-request';

export interface RecordEditorProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  suggestions?: VariableSuggestion[];
}

function toRows(record: Record<string, string>): KeyValue[] {
  const rows: KeyValue[] = Object.entries(record).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true,
  }));
  rows.push(newRow());
  return rows;
}

function toRecord(rows: KeyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.enabled && row.key.trim()) out[row.key.trim()] = row.value;
  }
  return out;
}

/**
 * A {@link KeyValueEditor} bound to a `Record<string,string>` payload field
 * (headers, gRPC metadata). Rows are held locally so editing keeps focus; the
 * flattened record is pushed out on every change.
 */
export function RecordEditor({
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  suggestions = [],
}: RecordEditorProps): JSX.Element {
  const [rows, setRows] = useState<KeyValue[]>(() => toRows(value));
  const handle = (next: KeyValue[]): void => {
    setRows(next);
    onChange(toRecord(next));
  };
  return (
    <div className="rounded-md border border-border">
      <KeyValueEditor
        rows={rows}
        onChange={handle}
        {...(keyPlaceholder ? { keyPlaceholder } : {})}
        {...(valuePlaceholder ? { valuePlaceholder } : {})}
        suggestions={suggestions}
      />
    </div>
  );
}
