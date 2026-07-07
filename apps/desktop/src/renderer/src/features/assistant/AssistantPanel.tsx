import { useEffect, useRef, useState } from 'react';
import { Bot, Check, CircleStop, History, Plus, Send, ShieldCheck, Trash2, Wrench, X } from 'lucide-react';
import type { AiToolDecision } from '@shared/ai';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui-store';
import { useConfirm } from '../../components/confirm/ConfirmProvider';
import { useAssistant, type ChatItem, type ToolActivityItem } from './use-assistant';

/** Compact relative-ish timestamp for the conversation history list. */
function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

const TOOL_DOT: Record<ToolActivityItem['status'], string> = {
  awaiting: 'bg-accent',
  running: 'bg-warning',
  ok: 'bg-success',
  error: 'bg-danger',
};

function ToolChip({
  tool,
  onConfirm,
}: {
  tool: ToolActivityItem;
  onConfirm: (callId: string, decision: AiToolDecision) => void;
}): JSX.Element {
  if (tool.status === 'awaiting') {
    return (
      <div className="rounded-md border border-accent/50 bg-accent/5 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-fg">
          <ShieldCheck size={13} className="shrink-0 text-accent" />
          <span className="font-medium">Confirm action</span>
        </div>
        <p className="mt-1 text-muted">{tool.preview ?? tool.name}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onConfirm(tool.callId, 'approve')}
            className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-accent-fg"
          >
            <Check size={12} /> Approve
          </button>
          {tool.tier !== 'execute' && (
            <button
              type="button"
              onClick={() => onConfirm(tool.callId, 'approve-always')}
              className="rounded border border-border px-2 py-1 text-muted hover:text-fg"
            >
              Approve all in chat
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm(tool.callId, 'deny')}
            className="rounded border border-border px-2 py-1 text-muted hover:text-danger"
          >
            Deny
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-bg px-2 py-1 text-xs text-muted">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TOOL_DOT[tool.status])} />
      <Wrench size={11} className="shrink-0" />
      <span className="font-mono text-fg">{tool.name}</span>
      {tool.summary && <span className="truncate">— {tool.summary}</span>}
    </div>
  );
}

function MessageBubble({
  item,
  onConfirm,
}: {
  item: ChatItem;
  onConfirm: (callId: string, decision: AiToolDecision) => void;
}): JSX.Element {
  if (item.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg">
          {item.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {item.tools.length > 0 && (
        <div className="flex flex-col gap-1">
          {item.tools.map((tool) => (
            <ToolChip key={tool.callId} tool={tool} onConfirm={onConfirm} />
          ))}
        </div>
      )}
      {(item.text || item.streaming) && (
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg">
          {item.text}
          {item.streaming && <span className="ml-0.5 animate-pulse text-muted">▍</span>}
        </div>
      )}
      {item.error && (
        <div className="max-w-[85%] rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {item.error}
        </div>
      )}
    </div>
  );
}

/**
 * The AI assistant chat dock (ADR-0012, Phase 1). Docks on the right of the app
 * chrome following the DispatchMonitor pattern. Streams the model's reply and
 * shows each read-only tool the assistant invoked as an inline chip.
 */
export function AssistantPanel(): JSX.Element {
  const toggleAssistant = useUiStore((s) => s.toggleAssistant);
  const assistant = useAssistant();
  const confirm = useConfirm();
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const deleteConversation = (id: string, title: string): void => {
    void confirm({
      title: 'Delete chat',
      message: `Delete "${title || 'Untitled chat'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    }).then((ok) => {
      if (ok) assistant.deleteConversation(id);
    });
  };

  // Reload providers whenever the panel mounts (e.g. after adding one in Settings).
  useEffect(() => {
    assistant.refreshProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [assistant.items]);

  const submit = (): void => {
    if (!draft.trim()) return;
    assistant.send(draft);
    setDraft('');
  };

  const hasProviders = assistant.providers.length > 0;

  return (
    <section
      aria-label="AI assistant"
      className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-surface"
    >
      <header className="flex h-12 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-accent" />
          <span className="text-sm font-semibold">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              assistant.newChat();
              setShowHistory(false);
            }}
            aria-label="New chat"
            title="New chat"
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowHistory((open) => {
                if (!open) assistant.loadConversations();
                return !open;
              });
            }}
            aria-label="Conversation history"
            title="History"
            className={cn(
              'rounded p-1 text-muted hover:bg-surface-2 hover:text-fg',
              showHistory && 'text-accent',
            )}
          >
            <History size={15} />
          </button>
          <button
            type="button"
            onClick={toggleAssistant}
            aria-label="Close assistant"
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {showHistory ? (
        <div className="flex-1 overflow-auto p-2">
          {assistant.conversations.length === 0 ? (
            <p className="p-3 text-sm text-muted">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {assistant.conversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className={cn(
                    'group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2',
                    conversation.id === assistant.activeConversationId && 'bg-surface-2',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      assistant.loadConversation(conversation.id);
                      setShowHistory(false);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm text-fg">
                      {conversation.title || 'Untitled chat'}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {formatWhen(conversation.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteConversation(conversation.id, conversation.title)}
                    aria-label="Delete conversation"
                    className="rounded p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
      {hasProviders && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <label className="text-xs text-muted">Model</label>
          <select
            value={assistant.providerId ?? ''}
            onChange={(e) => assistant.setProviderId(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
          >
            {assistant.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label} · {provider.defaultModel}
              </option>
            ))}
          </select>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto p-3">
        {!assistant.available ? (
          <p className="text-sm text-muted">The assistant is available inside the desktop app.</p>
        ) : !hasProviders ? (
          <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-muted">
            <p className="font-medium text-fg">No AI provider configured</p>
            <p className="mt-1">
              Add a provider and API key in <span className="text-fg">Settings → AI Providers</span>{' '}
              to start chatting. Your key is stored encrypted on this device and only used to reach
              the provider you choose.
            </p>
          </div>
        ) : assistant.items.length === 0 ? (
          <div className="mt-6 text-center text-sm text-muted">
            <Bot size={28} className="mx-auto mb-2 opacity-60" />
            <p>Ask about your collections, requests, workflows, or variables.</p>
            <p className="mt-1 text-xs">
              It can create requests and folders too — every change asks for your approval first.
            </p>
          </div>
        ) : (
          assistant.items.map((item) => (
            <MessageBubble key={item.id} item={item} onConfirm={assistant.confirmTool} />
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            disabled={!hasProviders}
            placeholder={hasProviders ? 'Ask the assistant…' : 'Configure a provider first'}
            className="min-h-0 flex-1 resize-none rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
          />
          {assistant.streaming ? (
            <button
              type="button"
              onClick={assistant.cancel}
              aria-label="Stop"
              title="Stop"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-fg"
            >
              <CircleStop size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || !hasProviders}
              aria-label="Send"
              title="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
        </>
      )}
    </section>
  );
}
