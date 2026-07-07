/**
 * In-app AI assistant (ADR-0012). Bring-your-own-key providers, an encrypted
 * key store, and a manual tool-use agent loop with read-only tools (Phase 1).
 */
export { AiProviderStore, type ProviderWithKey } from './ai-provider-store';
export { AssistantService, type AssistantSnapshot } from './assistant-service';
export { createReadOnlyTools, createWriteTools, type AiTool, type AiToolDeps } from './tools';
export { providerFor } from './providers';
