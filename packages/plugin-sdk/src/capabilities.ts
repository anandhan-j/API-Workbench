/**
 * Capabilities a plugin may request in its manifest. The user confirms grants
 * at install time; the host enforces them on every call (ADR-0007). Per-plugin
 * key/value storage and logging are always available and need no capability.
 *
 * - `network` — outbound HTTP via `context.fetch`.
 * - `variables:read` — resolve `{{variable}}` templates via `context.variables`.
 * - `variables:write` — set workspace/global variables via `context.variables`.
 */
export type Capability = 'network' | 'variables:read' | 'variables:write';
