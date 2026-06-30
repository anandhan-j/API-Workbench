/**
 * Display label for a request whose name is empty (e.g. an imported operation
 * with no `summary`): falls back to the endpoint path, stripping a leading
 * `{{baseUrl}}` variable so the row shows something meaningful.
 */
export function endpointLabel(url: string): string {
  return url.replace(/^\{\{[^}]+\}\}/, '').trim() || url.trim() || 'Untitled request';
}

/** The label to display for a request: its trimmed name, or the endpoint fallback. */
export function requestDisplayName(name: string, url: string): string {
  return name.trim() || endpointLabel(url);
}
