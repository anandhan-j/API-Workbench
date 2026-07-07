import { z } from 'zod';

/**
 * Transport DTOs for the in-app AI assistant (ADR-0012, Phase 1).
 *
 * The assistant is bring-your-own-key: a user configures one or more providers
 * (Anthropic Claude or any OpenAI-compatible endpoint — OpenAI, DeepSeek, Groq,
 * OpenRouter, local Ollama) with their own API key. The key is encrypted at rest
 * in the main process and NEVER crosses the IPC boundary: the renderer-facing
 * {@link AiProviderConfig} exposes only a `hasKey` flag, mirroring the secret
 * handling of the variable engine and the auth credential store.
 *
 * Phase 1 ships read-only tools (list/search collections, requests, workflows,
 * variables). Write/execute tools with confirmation gates come in later phases.
 */

/** Which wire protocol a provider speaks. */
export const AiProviderKind = z.enum(['anthropic', 'openai-compat']);
export type AiProviderKind = z.infer<typeof AiProviderKind>;

/**
 * A configured provider as exposed to the renderer. The API key is never
 * included; `hasKey` reports whether one is stored.
 */
export const AiProviderConfig = z.object({
  id: z.string(),
  kind: AiProviderKind,
  label: z.string().min(1),
  /**
   * Endpoint base URL. For `openai-compat` this is the chat-completions base
   * (DeepSeek, Ollama, …). For `anthropic` it is optional and, when set, points
   * Claude at a gateway that fronts the Anthropic Messages API (e.g. an
   * enterprise gateway like Aerolink); null uses `api.anthropic.com`.
   */
  baseUrl: z.string().nullable(),
  defaultModel: z.string().min(1),
  /**
   * Extra HTTP headers sent on every request to this provider — for gateways
   * that need a routing or `Authorization` header beyond the API key. Stored
   * on-device; prefer the API key field for the primary credential.
   */
  headers: z.record(z.string()).default({}),
  /** Whether an encrypted API key is stored for this provider. */
  hasKey: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type AiProviderConfig = z.infer<typeof AiProviderConfig>;

/**
 * Create or update a provider. On update (`id` present) the `apiKey` is applied
 * only when a non-empty value is provided, so re-saving metadata leaves the
 * stored key untouched.
 */
export const SaveAiProviderInput = z.object({
  id: z.string().optional(),
  kind: AiProviderKind,
  label: z.string().min(1),
  baseUrl: z.string().nullable().optional(),
  defaultModel: z.string().min(1),
  /** Extra HTTP headers for gateways (routing / auth). Replaces the stored set when provided. */
  headers: z.record(z.string()).optional(),
  /** Plaintext API key; encrypted before storage, never returned. */
  apiKey: z.string().optional(),
});
export type SaveAiProviderInput = z.infer<typeof SaveAiProviderInput>;

/** Verify a provider's credentials with a cheap round-trip (by id, or inline pre-save). */
export const VerifyProviderInput = z.object({
  id: z.string().optional(),
  kind: AiProviderKind.optional(),
  baseUrl: z.string().nullable().optional(),
  model: z.string().optional(),
  headers: z.record(z.string()).optional(),
  apiKey: z.string().optional(),
});
export type VerifyProviderInput = z.infer<typeof VerifyProviderInput>;

export const VerifyProviderResult = z.object({
  ok: z.boolean(),
  /** A model id echoed back on success, when the provider reports one. */
  model: z.string().optional(),
  error: z.string().optional(),
});
export type VerifyProviderResult = z.infer<typeof VerifyProviderResult>;

/** One model offered by a provider's models endpoint. */
export const AiModelInfo = z.object({
  id: z.string(),
  displayName: z.string().optional(),
});
export type AiModelInfo = z.infer<typeof AiModelInfo>;

/** Result of fetching a provider's available models with its credentials. */
export const ListModelsResult = z.object({
  ok: z.boolean(),
  models: z.array(AiModelInfo),
  error: z.string().optional(),
});
export type ListModelsResult = z.infer<typeof ListModelsResult>;

// --- Conversations & messages ---

export const AiMessageRole = z.enum(['user', 'assistant']);
export type AiMessageRole = z.infer<typeof AiMessageRole>;

/** A persisted transcript turn (user text or final assistant text). */
export const AiMessage = z.object({
  id: z.string(),
  role: AiMessageRole,
  content: z.string(),
  createdAt: z.number(),
});
export type AiMessage = z.infer<typeof AiMessage>;

export const AiConversation = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type AiConversation = z.infer<typeof AiConversation>;

export const AiConversationDetail = AiConversation.extend({
  messages: z.array(AiMessage),
});
export type AiConversationDetail = z.infer<typeof AiConversationDetail>;

/**
 * Start a turn. If `conversationId` is omitted a new conversation is created and
 * its id is returned. The assistant reply streams over the `ai.chat.event`
 * channel; the final text is persisted when the turn completes.
 */
export const AiChatSendInput = z.object({
  conversationId: z.string().optional(),
  providerId: z.string(),
  /** Overrides the provider's `defaultModel` for this turn. */
  model: z.string().optional(),
  content: z.string().min(1),
});
export type AiChatSendInput = z.infer<typeof AiChatSendInput>;

export const AiChatSendResult = z.object({
  conversationId: z.string(),
  userMessage: AiMessage,
});
export type AiChatSendResult = z.infer<typeof AiChatSendResult>;

// --- Streaming events (ai.chat.event) ---

/** A tool the assistant invoked, as surfaced to the UI. */
export const AiToolActivity = z.object({
  callId: z.string(),
  name: z.string(),
  /** Pretty-printed arguments the model passed. */
  args: z.record(z.unknown()),
});
export type AiToolActivity = z.infer<typeof AiToolActivity>;

/** The user's decision on a pending write action (ADR-0012, Phase 2). */
export const AiToolDecision = z.enum(['approve', 'approve-always', 'deny']);
export type AiToolDecision = z.infer<typeof AiToolDecision>;

/**
 * A streaming assistant event. All events carry the `conversationId` so a
 * single renderer listener can route to the right conversation.
 */
export const AiChatEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), conversationId: z.string(), messageId: z.string() }),
  z.object({ type: z.literal('delta'), conversationId: z.string(), text: z.string() }),
  z.object({
    type: z.literal('tool-call'),
    conversationId: z.string(),
    callId: z.string(),
    name: z.string(),
    args: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('tool-confirm'),
    conversationId: z.string(),
    callId: z.string(),
    name: z.string(),
    args: z.record(z.unknown()),
    /** Human-readable description of the pending action, for the confirmation card. */
    preview: z.string(),
    /** `write` actions can be batch-approved for the chat; `execute` actions are always confirmed. */
    tier: z.enum(['write', 'execute']),
  }),
  z.object({
    type: z.literal('tool-result'),
    conversationId: z.string(),
    callId: z.string(),
    ok: z.boolean(),
    /** Short human-readable outcome (e.g. "12 collections"). */
    summary: z.string(),
  }),
  z.object({
    type: z.literal('usage'),
    conversationId: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
  }),
  z.object({
    type: z.literal('done'),
    conversationId: z.string(),
    messageId: z.string(),
    content: z.string(),
  }),
  z.object({ type: z.literal('error'), conversationId: z.string(), message: z.string() }),
]);
export type AiChatEvent = z.infer<typeof AiChatEvent>;

/** The data domains an assistant write can touch, used to invalidate renderer caches. */
export const AiDataKind = z.enum(['collections', 'workflows', 'variables']);
export type AiDataKind = z.infer<typeof AiDataKind>;

/**
 * Pushed after the assistant mutates app data through a write/execute tool, so
 * the renderer refetches the affected views instead of showing stale data until
 * the user navigates away and back.
 */
export const AiDataChangedEvent = z.object({
  kinds: z.array(AiDataKind),
});
export type AiDataChangedEvent = z.infer<typeof AiDataChangedEvent>;
