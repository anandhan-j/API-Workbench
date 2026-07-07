import type { AiProviderKind } from '@shared/ai';
import type { AiProvider } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAiCompatProvider } from './openai-compat';

export type {
  AiProvider,
  AssistantBlock,
  AssistantTurn,
  NeutralMessage,
  StreamTurnParams,
  StreamCallbacks,
  ToolDef,
  ToolResult,
  VerifyParams,
} from './types';
export { AnthropicProvider } from './anthropic';
export { OpenAiCompatProvider } from './openai-compat';

const anthropic = new AnthropicProvider();
const openaiCompat = new OpenAiCompatProvider();

/** Selects the vendor adapter for a provider kind. Adapters are stateless singletons. */
export function providerFor(kind: AiProviderKind): AiProvider {
  return kind === 'anthropic' ? anthropic : openaiCompat;
}
