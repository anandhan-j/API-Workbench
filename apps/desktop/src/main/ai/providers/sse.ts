/**
 * Minimal Server-Sent Events reader for provider streaming responses.
 *
 * Yields the parsed JSON payload of each `data:` line. Handles the OpenAI
 * `[DONE]` sentinel and ignores comments/keepalives. Both the Anthropic and
 * OpenAI-compatible streaming APIs are line-delimited SSE, so one reader serves
 * both adapters.
 */
export async function* readSse(res: Response): AsyncGenerator<unknown> {
  const body = res.body;
  if (!body) return;
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          yield JSON.parse(data);
        } catch {
          // Ignore non-JSON keepalive lines.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Truncates provider error bodies so they stay readable in the UI and logs. */
export function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Formats a non-2xx provider response into a user-facing message. A 429 gets an
 * actionable hint, since the raw body is often a wall of JSON about token limits.
 */
export function formatApiError(label: string, status: number, body: string): string {
  const base = `${label} API ${status}: ${truncate(body)}`;
  if (status === 429) {
    return `${base}\n\nRate limit reached. The assistant retried automatically but your provider is still limiting requests — wait a minute and try again, switch to a smaller/faster model, or raise your provider's API tier.`;
  }
  return base;
}
