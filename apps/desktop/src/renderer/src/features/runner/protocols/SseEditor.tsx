import type { SsePayload } from '@shared/protocol';
import { VariableField } from '../../variables/VariableField';
import { Labeled, INPUT_CLASS } from './fields';
import { RecordEditor } from './RecordEditor';
import { CollectSettingsEditor } from './CollectSettingsEditor';
import type { ProtocolEditorProps } from './types';

/** Editor for an SSE subscription in collect mode: URL, method, headers, body. */
export function SseEditor({
  value,
  onChange,
  suggestions,
  variableContext,
}: ProtocolEditorProps): JSX.Element {
  const payload = value as unknown as SsePayload;
  const patch = (p: Partial<SsePayload>): void => onChange({ ...value, ...p });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          value={payload.method ?? 'GET'}
          onChange={(e) => patch({ method: e.target.value as SsePayload['method'] })}
          aria-label="SSE method"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-bold"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>
        <div className="min-w-0 flex-1">
          <VariableField
            value={payload.url ?? ''}
            onChange={(url) => patch({ url })}
            suggestions={suggestions}
            {...(variableContext ? { variableContext } : {})}
            placeholder="{{baseUrl}}/events"
            aria-label="SSE URL"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {payload.method === 'POST' && (
        <Labeled label="Body">
          <VariableField
            value={payload.body ?? ''}
            onChange={(body) => patch({ body })}
            suggestions={suggestions}
            {...(variableContext ? { variableContext } : {})}
            multiline
            rows={4}
            aria-label="SSE request body"
            className={`${INPUT_CLASS} resize-y`}
          />
        </Labeled>
      )}

      <Labeled label="Headers">
        <RecordEditor
          value={payload.headers ?? {}}
          onChange={(headers) => patch({ headers })}
          keyPlaceholder="Header"
          suggestions={suggestions}
        />
      </Labeled>

      <CollectSettingsEditor
        value={payload.collect ?? { maxEvents: 50, durationMs: 10_000 }}
        onChange={(collect) => patch({ collect })}
      />
    </div>
  );
}
