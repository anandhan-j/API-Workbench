/**
 * Retry policy for provider HTTP calls (ADR-0012).
 *
 * LLM endpoints commonly return 429 (rate limit) and 529 (overloaded), which are
 * transient — the official SDKs retry them automatically. Our raw-fetch adapters
 * need the same: retry 429 / 529 / 5xx and connection failures with exponential
 * backoff, honouring a `retry-after` header when present, and aborting the wait
 * if the turn is cancelled.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_BACKOFF_MS = 8_000;
/** Cap on how long we'll honour a `retry-after` before giving up, so a turn can't block for a full minute. */
const MAX_RETRY_AFTER_MS = 30_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 529 || status >= 500;
}

/** Reads a `retry-after` header (delta-seconds or HTTP-date) into milliseconds. */
function retryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

function backoffMs(attempt: number): number {
  const exp = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * 2 ** attempt);
  return exp / 2 + Math.random() * (exp / 2); // full-jitter over [exp/2, exp]
}

/** A promise that resolves after `ms`, or rejects if the signal aborts first. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      cleanup();
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * `fetch` with bounded retry/backoff on transient failures. Returns the final
 * `Response` (which the caller inspects for `ok`); rethrows on abort or when a
 * connection error persists past the retry budget.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal });
    } catch (error) {
      if (signal?.aborted || attempt >= MAX_RETRIES) throw error;
      await delay(backoffMs(attempt), signal);
      attempt += 1;
      continue;
    }

    if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
      const wait = Math.min(retryAfterMs(res) ?? backoffMs(attempt), MAX_RETRY_AFTER_MS);
      // Release the connection before waiting so the socket can be reused.
      await res.body?.cancel().catch(() => undefined);
      await delay(wait, signal);
      attempt += 1;
      continue;
    }
    return res;
  }
}
