# ADR-0012: In-app AI assistant with bring-your-own-key providers

- **Status:** Proposed
- **Date:** 2026-07-07
- **Related:** ADR-0003, ADR-0005, ADR-0006, ADR-0010, ADR-0011

## Context

ADR-0011 gave *external* AI assistants (Claude Desktop, Cursor, other MCP clients) a schema-accurate path to author workflows. The natural next step is the inverse: an assistant *inside* the app that can operate on everything the user can — browse and edit collections, create and update requests, author and run workflows, manage (non-secret) variables — driven by an LLM the user chooses and pays for with their own API key (Anthropic Claude, OpenAI, DeepSeek, or any OpenAI-compatible endpoint, including local ones like Ollama).

Three properties of the codebase make this cheap to do well and shape the design:

1. **The IPC contract is already a tool surface.** Every operation the assistant should perform exists as a typed channel in `shared/ipc-contract.ts` with Zod request/response schemas — `collection.*`, `request.*`, `workflow.*`, `variable.*`, `request.execute`, `workflow.run`. Tool definitions for the LLM can be *derived* from those same schemas, so the assistant's view of the app cannot drift from what the app accepts (the same no-drift argument as ADR-0011's generated workflow schema).
2. **Secrets infrastructure exists.** The `Encryptor` port (`safeStorage` in production, ADR-0006) already protects auth credentials and secret variables, and the DTO convention (`hasValue`, masked secrets) already keeps plaintext out of the renderer. An LLM API key is just one more encrypted blob behind the same port.
3. **The app is offline-first.** The assistant must be strictly opt-in: no key configured → no network calls, no UI nagging, no cloud dependency. Bring-your-own-key preserves the "no mandatory cloud" posture — the only network traffic is from the user's machine to the provider they chose.

The hard problems are not plumbing; they are **trust and control**: an LLM that can mutate user data needs a permission model, an undo story, and defenses against prompt injection (an executed API's *response body* is untrusted text that flows back into the model's context).

## Decision

Build the assistant as a **first-class app feature in the main process** — not a plugin, and not a client of the spawned MCP child. It has four parts.

**1. Provider layer (`main/ai/providers/`).** A small `AiProvider` port normalizes chat-with-tools across vendors into one internal event stream (`text-delta`, `tool-call`, `usage`, `done`, `error`):

- `AnthropicProvider` — the official `@anthropic-ai/sdk`; default model `claude-opus-4-8`, adaptive thinking, streaming, native `tool_use` blocks.
- `OpenAiCompatProvider` — OpenAI's chat-completions wire format with a configurable `baseUrl`, which covers OpenAI, DeepSeek, Groq, OpenRouter, and local Ollama from one adapter. Function-calling deltas are normalized into the same internal events.

Adding a provider means adding an adapter + a preset (name, base URL, default model, models-list endpoint). No agent-loop code changes.

**2. Key storage (`main/ai/ai-provider-store.ts`).** A new encrypted store modeled directly on `AuthService` (ADR-0006): a `provider_configs`-style table holding `{ provider, label, baseUrl, defaultModel, encryptedKey }`, encrypted via the injected `Encryptor`. The DTO that crosses IPC exposes `hasKey: boolean` — the plaintext key never leaves the main process, exactly like secret variables. Keys are entered and tested ("verify key" makes one cheap models-list or ping call) in Settings.

**3. Agent loop + tool registry (`main/ai/`).** A manual tool-use loop runs in the main process, where the services and secrets already live. Tools are a **curated registry** (~15–20 in v1), each defined by a Zod schema converted to JSON Schema and an executor that calls the *same service methods the IPC handlers call* — in-process, no HTTP hop through the MCP child. Grouped by risk tier:

| Tier | Examples | Gate |
|---|---|---|
| **Read** | list/search collections & requests, get request, list workflows, get workflow, workflow schema, list variables (masked) | auto-allowed |
| **Write** | create/update request, create folder, set non-secret variable, generate/validate/save workflow | per-call confirmation, with a per-conversation "allow writes" opt-in |
| **Execute & destructive** | run request, run workflow, delete anything | always confirmed, never batched |

Workflow authoring tools reuse the `workflow-mcp` package's schema-generation and validation modules (extracted for shared use), so the assistant validates candidates against the exact same generated schema as external MCP clients.

Safety rails, in order of importance:

- **Confirmation UI** — a pending tool call streams to the renderer as a card (name + pretty-printed args + diff where applicable) with Approve / Deny; deny feeds an `is_error` tool result back so the model can adjust. This mirrors the plugin capability broker (ADR-0010) and the MCP overwrite elicitation (ADR-0011).
- **Auto-snapshot** — before the first mutating tool call of a conversation turn, the versioning service snapshots the touched collection/workflow (same pattern as the auto-snapshots around OpenAPI import/sync), so every AI edit is one-click reversible.
- **Secrets never reach the model** — variable listings go through the existing `mask()` path; there is no tool that returns secret plaintext or credential contents, and no tool to *set* a secret.
- **Prompt-injection containment** — response bodies from `run request` are untrusted input. They are wrapped in clearly labeled data blocks in the tool result, and the confirmation gates on all writes/executes are the structural backstop: injected text can *ask* for a mutation but cannot perform one without the user clicking Approve.
- **Context discipline** — the assistant never receives a database dump. The system prompt carries only the active workspace/project identity; everything else is fetched on demand through paginated search/list tools.

**4. IPC + renderer.** New channels in the existing contract: `ai.providers.list/save/delete/verify`, `ai.chat.send`, `ai.chat.cancel` (AbortController map keyed by conversation id, same as `request.execute`), plus a push event `ai.chat.event` streaming text deltas and tool-call lifecycle (the `connection.event` / `workflow.nodeProgress` pattern). The renderer gets `features/assistant/` with an `AssistantPanel` docked via the `DispatchMonitor`/`monitorOpen` pattern (`assistantOpen` in `ui-store`), an "Assistant" entry in `Sidebar.tsx`, and a provider section in Settings. Conversations persist in SQLite via a small migration so history survives restarts.

**Delivery phases:**

1. Provider store + Settings UI + chat panel with **read-only** tools.
2. Write tools with the confirmation/snapshot machinery.
3. Workflow authoring (shared schema/validation with `workflow-mcp`) + execute tools.
4. Optional follow-ons, each its own decision: an **AI workflow node** (LLM call as a step — fits either a new built-in `WorkflowNodeKind` or a plugin `NodeContribution` with the `network` capability), and the assistant acting as an **MCP client** so users can attach their own external MCP servers as extra tools.

## Alternatives considered

**Route the assistant through the spawned MCP child as a client.** Superficially appealing reuse, but the child exposes only workflow authoring; widening it into a full app-control surface would grow a *network-reachable* listener into exactly the attack surface ADR-0011 worked to minimize, and every tool call would pay an HTTP round trip for services living in the same process. Rejected — the two features stay complementary: MCP serves external clients, the assistant calls services in-process. They share the workflow schema/validation code, not a transport.

**Ship it as a plugin.** The plugin system has no panel/view contribution point (renderer UI is declarative forms only), its capabilities (`network`, `variables:*`, `ui:dialog`) are far too coarse for "operate on all app data", and plugin code runs in the unprivileged host by design (ADR-0010). An assistant that needs broad, gated service access is the opposite trust profile. Rejected for the assistant itself; an AI *node* can still be a plugin later.

**A vendor-hosted proxy / built-in subscription.** Central key management and margin, but it breaks the offline-first, no-mandatory-cloud promise and makes us a data processor for users' API traffic. Rejected; BYOK keeps the trust boundary at the user's own provider account.

**An agent framework (LangChain-style).** The loop we need — stream, collect tool calls, gate, execute, append results, repeat — is ~200 lines against two adapters. A framework adds a heavy dependency tree to the privileged main process for little leverage. Rejected in favor of thin adapters behind the `AiProvider` port.

## Consequences

Users get an assistant that can see and safely change real app state, with any provider they hold a key for, and everything it does is confirmable and snapshot-reversible. The design adds no new listener, no new process, and no cloud dependency, and the tool surface is derived from the same Zod contract the app already enforces.

The costs: two provider wire formats to track as vendors evolve (contained in adapters); a new encrypted store and conversation table (one migration each); a curated tool registry to keep in sync as channels evolve (mitigated by deriving schemas from `shared/`); prompt-injection risk that is contained but not eliminated by the confirmation gates — the assistant must never gain an ungated mutation path; and token costs that are the user's, which the UI should surface per conversation (`usage` events) so they are never surprised.
