import { useEffect, useState } from 'react';
import { Paperclip, Wand2, X } from 'lucide-react';
import type { ResolvedKey } from '@shared/variable';
import { KeyValueEditor } from './KeyValueEditor';
import { FormDataEditor } from './FormDataEditor';
import type { BodyMode, KeyValue, RawType } from './build-request';
import { formatRawBody } from './format-body';
import { VariableField } from '../variables/VariableField';
import { pickFile, formatBytes } from '../../lib/pick-file';

export interface BodyEditorProps {
  mode: BodyMode;
  rawType: RawType;
  rawBody: string;
  formFields: KeyValue[];
  binaryBase64: string;
  binaryFileName: string;
  suggestions?: ResolvedKey[];
  onChange: (
    patch: Partial<{
      bodyMode: BodyMode;
      rawType: RawType;
      rawBody: string;
      formFields: KeyValue[];
      binaryBase64: string;
      binaryFileName: string;
    }>,
  ) => void;
}

const MODES: { value: BodyMode; label: string }[] = [
  { value: 'none', label: 'none' },
  { value: 'formdata', label: 'form-data' },
  { value: 'urlencoded', label: 'x-www-form-urlencoded' },
  { value: 'raw', label: 'raw' },
  { value: 'binary', label: 'binary' },
];

/** Body tab: mode selector + the editor for the selected mode. */
export function BodyEditor({
  mode,
  rawType,
  rawBody,
  formFields,
  binaryFileName,
  suggestions = [],
  onChange,
}: BodyEditorProps): JSX.Element {
  const [formatError, setFormatError] = useState<string | null>(null);
  // Clear any stale "invalid" message once the body or type changes.
  useEffect(() => setFormatError(null), [rawBody, rawType, mode]);

  const canFormat = rawType === 'json' || rawType === 'xml';
  const formatBody = (): void => {
    const result = formatRawBody(rawBody, rawType);
    if (result.ok) {
      if (result.value !== rawBody) onChange({ rawBody: result.value });
    } else {
      setFormatError(result.error);
    }
  };

  const chooseBinary = async (): Promise<void> => {
    const file = await pickFile();
    if (file) onChange({ binaryBase64: file.base64, binaryFileName: `${file.name} (${formatBytes(file.size)})` });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {MODES.map((m) => (
          <label key={m.value} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="body-mode"
              checked={mode === m.value}
              onChange={() => onChange({ bodyMode: m.value })}
            />
            {m.label}
          </label>
        ))}
        {mode === 'raw' && (
          <div className="ml-auto flex items-center gap-2">
            {canFormat && (
              <button
                type="button"
                onClick={formatBody}
                disabled={!rawBody.trim()}
                title={`Format ${rawType.toUpperCase()}`}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                <Wand2 size={13} /> Format
              </button>
            )}
            <select
              aria-label="Raw type"
              value={rawType}
              onChange={(e) => onChange({ rawType: e.target.value as RawType })}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              <option value="json">JSON</option>
              <option value="text">Text</option>
              <option value="xml">XML</option>
            </select>
          </div>
        )}
      </div>

      {mode === 'raw' && formatError && (
        <p className="text-xs text-danger" role="alert">
          Couldn’t format: {formatError}
        </p>
      )}

      {mode === 'none' && <p className="text-sm text-muted">This request has no body.</p>}

      {mode === 'raw' && (
        <VariableField
          multiline
          value={rawBody}
          onChange={(v) => onChange({ rawBody: v })}
          suggestions={suggestions}
          aria-label="Raw body"
          rows={10}
          placeholder={rawType === 'json' ? '{\n  "key": "value"\n}' : 'Body — supports {{variables}}'}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs"
        />
      )}

      {mode === 'urlencoded' && (
        <div className="rounded-md border border-border">
          <KeyValueEditor rows={formFields} onChange={(rows) => onChange({ formFields: rows })} suggestions={suggestions} />
        </div>
      )}

      {mode === 'formdata' && (
        <div className="rounded-md border border-border">
          <FormDataEditor rows={formFields} onChange={(rows) => onChange({ formFields: rows })} suggestions={suggestions} />
        </div>
      )}

      {mode === 'binary' && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void chooseBinary()}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <Paperclip size={14} /> {binaryFileName ? 'Change file' : 'Select file'}
          </button>
          {binaryFileName ? (
            <span className="flex items-center gap-2 text-sm text-muted">
              {binaryFileName}
              <button
                type="button"
                aria-label="Remove file"
                onClick={() => onChange({ binaryBase64: '', binaryFileName: '' })}
                className="text-muted hover:text-danger"
              >
                <X size={13} />
              </button>
            </span>
          ) : (
            <span className="text-sm text-muted">No file selected</span>
          )}
        </div>
      )}
    </div>
  );
}
