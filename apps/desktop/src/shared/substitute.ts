/**
 * Generic deep `{{variable}}` substitution for protocol payloads (ADR-0009).
 *
 * Providers whose payloads are plain data (gRPC, WebSocket, SSE, plugin types)
 * use this as their `resolveVariables`; HTTP/GraphQL instead evaluate
 * field-by-field during request build to preserve legacy semantics.
 */
export function deepSubstitute(value: unknown, evaluate: (template: string) => string): unknown {
  if (typeof value === 'string') return evaluate(value);
  if (Array.isArray(value)) return value.map((item) => deepSubstitute(item, evaluate));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = deepSubstitute(entry, evaluate);
    }
    return out;
  }
  return value;
}
