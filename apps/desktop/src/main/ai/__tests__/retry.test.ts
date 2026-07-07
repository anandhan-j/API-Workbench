// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '../providers/retry';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('fetchWithRetry', () => {
  it('retries a 429 honouring retry-after, then returns the success response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await fetchWithRetry('https://example.com', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget and returns the last failing response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('overloaded', { status: 529, headers: { 'retry-after': '0' } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await fetchWithRetry('https://example.com', { method: 'POST' });
    expect(res.status).toBe(529);
    // 1 initial attempt + 3 retries.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry a non-retryable 4xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad key', { status: 401 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await fetchWithRetry('https://example.com', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops retrying once the signal is aborted', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve(new Response('rl', { status: 429, headers: { 'retry-after': '0' } }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchWithRetry('https://example.com', { method: 'POST' }, controller.signal)).rejects.toThrow(
      /Aborted/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
