import type { VariableSuggestion } from '../../variables/suggestion';

/** Scope context passed to {@link VariableField} inside a protocol editor. */
export interface ProtocolEditorContext {
  collectionId?: string;
  requestId?: string;
}

/**
 * Props every built-in protocol editor takes. `value` is the request's stored
 * payload (the `pluginPayload` bag, ADR-0009); `onChange` replaces it. Each
 * editor casts `value` to its own payload type from `@shared/protocol`.
 */
export interface ProtocolEditorProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  suggestions: VariableSuggestion[];
  variableContext?: ProtocolEditorContext;
}
