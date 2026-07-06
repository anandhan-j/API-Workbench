import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { WebSocketPayload } from '@shared/protocol';
import { VariableField } from '../../variables/VariableField';
import { Labeled, INPUT_CLASS, parseIntField } from './fields';
import { RecordEditor } from './RecordEditor';
import { CollectSettingsEditor } from './CollectSettingsEditor';
import type { ProtocolEditorProps } from './types';

type Message = WebSocketPayload['messages'][number];

function parseSubprotocols(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Editor for a WebSocket session in collect mode: URL, subprotocols, the
 * scripted messages sent after connect, headers, and the collect limits.
 */
export function WebSocketEditor({
  value,
  onChange,
  suggestions,
  variableContext,
}: ProtocolEditorProps): JSX.Element {
  const payload = value as unknown as WebSocketPayload;
  const patch = (p: Partial<WebSocketPayload>): void => onChange({ ...value, ...p });
  const messages: Message[] = payload.messages ?? [];
  // Keep the raw subprotocols text locally so commas/spaces survive typing;
  // the parsed array is pushed into the payload on every change.
  const [subprotocolsText, setSubprotocolsText] = useState((payload.subprotocols ?? []).join(', '));

  const setMessage = (index: number, next: Partial<Message>): void =>
    patch({ messages: messages.map((m, i) => (i === index ? { ...m, ...next } : m)) });
  const addMessage = (): void => patch({ messages: [...messages, { data: '', delayMs: 0 }] });
  const removeMessage = (index: number): void =>
    patch({ messages: messages.filter((_, i) => i !== index) });

  return (
    <div className="space-y-3">
      <Labeled label="URL">
        <VariableField
          value={payload.url ?? ''}
          onChange={(url) => patch({ url })}
          suggestions={suggestions}
          {...(variableContext ? { variableContext } : {})}
          placeholder="wss://echo.websocket.org"
          aria-label="WebSocket URL"
          className={INPUT_CLASS}
        />
      </Labeled>

      <Labeled label="Subprotocols" hint="comma-separated, optional">
        <input
          value={subprotocolsText}
          onChange={(e) => {
            setSubprotocolsText(e.target.value);
            patch({ subprotocols: parseSubprotocols(e.target.value) });
          }}
          placeholder="graphql-ws"
          aria-label="WebSocket subprotocols"
          className={INPUT_CLASS}
        />
      </Labeled>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Messages to send on connect</span>
          <button
            type="button"
            onClick={addMessage}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2"
          >
            <Plus size={12} /> Add
          </button>
        </div>
        {messages.length === 0 && (
          <p className="text-xs text-muted">No messages — the session just listens.</p>
        )}
        {messages.map((message, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <VariableField
                value={message.data}
                onChange={(data) => setMessage(i, { data })}
                suggestions={suggestions}
                {...(variableContext ? { variableContext } : {})}
                multiline
                rows={2}
                placeholder={'{ "type": "subscribe" }'}
                aria-label={`Message ${i + 1}`}
                className={`${INPUT_CLASS} resize-y`}
              />
            </div>
            <input
              type="number"
              value={message.delayMs}
              onChange={(e) => setMessage(i, { delayMs: parseIntField(e.target.value, message.delayMs, 0) })}
              aria-label={`Message ${i + 1} delay`}
              title="Delay (ms) after connect"
              className={`${INPUT_CLASS} w-24`}
            />
            <button
              type="button"
              onClick={() => removeMessage(i)}
              aria-label={`Remove message ${i + 1}`}
              className="mt-2 text-muted hover:text-danger"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <Labeled label="Headers" hint="sent on the handshake">
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
