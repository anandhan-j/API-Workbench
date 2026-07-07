import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiConversation, AiMessage, AiProviderConfig, AiToolDecision } from '@shared/ai';
import { invoke, isBridgeAvailable, onAiChatEvent } from '../../lib/ipc';
import { useUiStore } from '../../stores/ui-store';

export type ToolStatus = 'awaiting' | 'running' | 'ok' | 'error';

export interface ToolActivityItem {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolStatus;
  summary?: string;
  /** Human-readable description of a pending write, shown on the confirmation card. */
  preview?: string;
  /** `execute` actions can't be batch-approved; the card hides "Approve all" for them. */
  tier?: 'write' | 'execute';
}

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | {
      kind: 'assistant';
      id: string;
      text: string;
      tools: ToolActivityItem[];
      streaming: boolean;
      error?: string;
    };

export interface UseAssistant {
  available: boolean;
  providers: AiProviderConfig[];
  providerId: string | null;
  setProviderId: (id: string) => void;
  items: ChatItem[];
  streaming: boolean;
  /** Past conversations, most-recent first (loaded on demand). */
  conversations: AiConversation[];
  activeConversationId: string | null;
  send: (content: string) => void;
  cancel: () => void;
  confirmTool: (callId: string, decision: AiToolDecision) => void;
  newChat: () => void;
  refreshProviders: () => void;
  loadConversations: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

let assistantSeq = 0;
const nextId = (): string => `c${Date.now()}-${assistantSeq++}`;

/** Rebuilds displayable chat items from a persisted transcript (text turns only). */
function toItems(messages: AiMessage[]): ChatItem[] {
  return messages.map((message): ChatItem =>
    message.role === 'user'
      ? { kind: 'user', id: message.id, text: message.content }
      : { kind: 'assistant', id: message.id, text: message.content, tools: [], streaming: false },
  );
}

/**
 * State + event wiring for the AI assistant panel (ADR-0012).
 *
 * The active conversation id is persisted in the UI store, and its transcript is
 * reloaded from the main process whenever the panel mounts — so closing and
 * reopening the dock (or reloading the app) restores the current chat instead of
 * losing it. Continuing a restored conversation threads its full history as
 * context, because the main process rebuilds the transcript from the stored
 * conversation on every turn.
 */
export function useAssistant(): UseAssistant {
  const available = isBridgeAvailable();
  const activeConversationId = useUiStore((s) => s.activeConversationId);
  const setActiveConversationId = useUiStore((s) => s.setActiveConversationId);
  const providerId = useUiStore((s) => s.assistantProviderId);
  const setProviderId = useUiStore((s) => s.setAssistantProviderId);

  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [conversations, setConversations] = useState<AiConversation[]>([]);

  // The active conversation id and the streaming assistant item id are tracked in
  // refs so the event listener (registered once) always sees the current values.
  const convIdRef = useRef<string | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  const refreshProviders = useCallback(() => {
    if (!available) return;
    void invoke('ai.providers.list', {})
      .then((list) => {
        setProviders(list);
        // Keep the persisted selection when it still exists; otherwise pick the first.
        const current = useUiStore.getState().assistantProviderId;
        if (!current || !list.some((provider) => provider.id === current)) {
          setProviderId(list[0]?.id ?? null);
        }
      })
      .catch(() => undefined);
  }, [available, setProviderId]);

  const loadConversations = useCallback(() => {
    if (!available) return;
    void invoke('ai.conversations.list', {}).then(setConversations).catch(() => undefined);
  }, [available]);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  // Restore the persisted active conversation on mount (panel reopen / app reload).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!available || restoredRef.current) return;
    restoredRef.current = true;
    const id = useUiStore.getState().activeConversationId;
    if (!id) return;
    void invoke('ai.conversations.get', { id })
      .then((detail) => {
        convIdRef.current = detail.id;
        setItems(toItems(detail.messages));
      })
      .catch(() => setActiveConversationId(null)); // conversation was deleted elsewhere
  }, [available, setActiveConversationId]);

  const patchAssistant = useCallback(
    (fn: (item: Extract<ChatItem, { kind: 'assistant' }>) => Extract<ChatItem, { kind: 'assistant' }>) => {
      const targetId = assistantIdRef.current;
      if (!targetId) return;
      setItems((prev) =>
        prev.map((item) => (item.kind === 'assistant' && item.id === targetId ? fn(item) : item)),
      );
    },
    [],
  );

  useEffect(() => {
    if (!available) return undefined;
    return onAiChatEvent((event) => {
      // Ignore events for other conversations once ours is known; before the send
      // call resolves, adopt the id from the first event.
      if (convIdRef.current && event.conversationId !== convIdRef.current) return;
      if (!convIdRef.current) convIdRef.current = event.conversationId;

      switch (event.type) {
        case 'delta':
          patchAssistant((item) => ({ ...item, text: item.text + event.text }));
          break;
        case 'tool-confirm':
          patchAssistant((item) => ({
            ...item,
            tools: [
              ...item.tools,
              {
                callId: event.callId,
                name: event.name,
                args: event.args,
                status: 'awaiting',
                preview: event.preview,
                tier: event.tier,
              },
            ],
          }));
          break;
        case 'tool-call':
          patchAssistant((item) => {
            const exists = item.tools.some((tool) => tool.callId === event.callId);
            // A confirmed write already has an awaiting chip — flip it to running.
            if (exists) {
              return {
                ...item,
                tools: item.tools.map((tool) =>
                  tool.callId === event.callId ? { ...tool, status: 'running' } : tool,
                ),
              };
            }
            return {
              ...item,
              tools: [
                ...item.tools,
                { callId: event.callId, name: event.name, args: event.args, status: 'running' },
              ],
            };
          });
          break;
        case 'tool-result':
          patchAssistant((item) => ({
            ...item,
            tools: item.tools.map((tool) =>
              tool.callId === event.callId
                ? { ...tool, status: event.ok ? 'ok' : 'error', summary: event.summary }
                : tool,
            ),
          }));
          break;
        case 'done':
          patchAssistant((item) => ({
            ...item,
            text: event.content || item.text,
            streaming: false,
          }));
          setStreaming(false);
          assistantIdRef.current = null;
          break;
        case 'error':
          patchAssistant((item) => ({ ...item, streaming: false, error: event.message }));
          setStreaming(false);
          assistantIdRef.current = null;
          break;
        default:
          break;
      }
    });
  }, [available, patchAssistant]);

  const send = useCallback(
    (content: string) => {
      const text = content.trim();
      if (!text || !providerId || streaming) return;

      const assistantId = nextId();
      assistantIdRef.current = assistantId;
      setStreaming(true);
      setItems((prev) => [
        ...prev,
        { kind: 'user', id: nextId(), text },
        { kind: 'assistant', id: assistantId, text: '', tools: [], streaming: true },
      ]);

      void invoke('ai.chat.send', {
        providerId,
        content: text,
        ...(convIdRef.current ? { conversationId: convIdRef.current } : {}),
      })
        .then((result) => {
          convIdRef.current = result.conversationId;
          // Persist so the conversation is restored on reopen, and refresh history.
          setActiveConversationId(result.conversationId);
          loadConversations();
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          patchAssistant((item) => ({ ...item, streaming: false, error: message }));
          setStreaming(false);
          assistantIdRef.current = null;
        });
    },
    [providerId, streaming, patchAssistant, setActiveConversationId, loadConversations],
  );

  const cancel = useCallback(() => {
    if (!convIdRef.current) return;
    void invoke('ai.chat.cancel', { conversationId: convIdRef.current }).catch(() => undefined);
  }, []);

  const confirmTool = useCallback((callId: string, decision: AiToolDecision) => {
    if (!convIdRef.current) return;
    // Optimistically flip the chip so the buttons don't linger while the write runs.
    setItems((prev) =>
      prev.map((item) =>
        item.kind === 'assistant'
          ? {
              ...item,
              tools: item.tools.map((tool) =>
                tool.callId === callId && tool.status === 'awaiting'
                  ? { ...tool, status: decision === 'deny' ? 'error' : 'running' }
                  : tool,
              ),
            }
          : item,
      ),
    );
    void invoke('ai.chat.confirmTool', {
      conversationId: convIdRef.current,
      callId,
      decision,
    }).catch(() => undefined);
  }, []);

  const newChat = useCallback(() => {
    if (streaming) cancel();
    convIdRef.current = null;
    assistantIdRef.current = null;
    setItems([]);
    setStreaming(false);
    setActiveConversationId(null);
  }, [streaming, cancel, setActiveConversationId]);

  const loadConversation = useCallback(
    (id: string) => {
      if (streaming) cancel();
      void invoke('ai.conversations.get', { id })
        .then((detail) => {
          convIdRef.current = detail.id;
          assistantIdRef.current = null;
          setStreaming(false);
          setActiveConversationId(detail.id);
          setItems(toItems(detail.messages));
        })
        .catch(() => undefined);
    },
    [streaming, cancel, setActiveConversationId],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      void invoke('ai.conversations.delete', { id })
        .then(() => {
          setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
          if (convIdRef.current === id) newChat();
        })
        .catch(() => undefined);
    },
    [newChat],
  );

  return {
    available,
    providers,
    providerId,
    setProviderId,
    items,
    streaming,
    conversations,
    activeConversationId,
    send,
    cancel,
    confirmTool,
    newChat,
    refreshProviders,
    loadConversations,
    loadConversation,
    deleteConversation,
  };
}
