// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../providers/anthropic';
import { OpenAiCompatProvider } from '../providers/openai-compat';
import type { StreamTurnParams } from '../providers';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

/** Captures the headers of the first fetch call; returns a non-ok response so the turn ends fast. */
function mockFetchCapturingHeaders(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 400 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const baseParams: Omit<StreamTurnParams, 'headers'> = {
  apiKey: 'sk-key',
  baseUrl: 'https://gateway.internal',
  model: 'claude-opus-4-8',
  system: 'sys',
  messages: [{ role: 'user', text: 'hi' }],
  tools: [],
};

describe('provider custom headers', () => {
  it('Anthropic adapter merges gateway headers alongside x-api-key', async () => {
    const fetchMock = mockFetchCapturingHeaders();
    await new AnthropicProvider().streamTurn(
      { ...baseParams, headers: { Authorization: 'Bearer g', 'x-aerolink-route': 'prod' } },
      { onTextDelta: () => undefined },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gateway.internal/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-key');
    expect(headers['Authorization']).toBe('Bearer g');
    expect(headers['x-aerolink-route']).toBe('prod');
  });

  it('OpenAI-compatible adapter merges custom headers alongside the bearer token', async () => {
    const fetchMock = mockFetchCapturingHeaders();
    await new OpenAiCompatProvider().streamTurn(
      { ...baseParams, headers: { 'x-portkey-provider': 'anthropic' } },
      { onTextDelta: () => undefined },
    );

    const init = fetchMock.mock.calls[0][1];
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer sk-key');
    expect(headers['x-portkey-provider']).toBe('anthropic');
  });

  it('Anthropic listModels parses ids and display names and sends the key + gateway headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' },
            { id: 'claude-haiku-4-5' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await new AnthropicProvider().listModels({
      apiKey: 'sk-key',
      baseUrl: 'https://gateway.internal',
      model: '',
      headers: { 'x-aerolink-route': 'prod' },
    });

    expect(result.ok).toBe(true);
    expect(result.models).toEqual([
      { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
      { id: 'claude-haiku-4-5' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('https://gateway.internal/v1/models');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-key');
    expect((init.headers as Record<string, string>)['x-aerolink-route']).toBe('prod');
  });

  it('OpenAI-compatible listModels returns sorted ids and reports HTTP errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'gpt-3.5' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new OpenAiCompatProvider();
    const ok = await provider.listModels({ apiKey: 'k', baseUrl: 'https://api.x/v1', model: '' });
    expect(ok.ok).toBe(true);
    expect(ok.models.map((m) => m.id)).toEqual(['gpt-3.5', 'gpt-4o']);

    const bad = await provider.listModels({ apiKey: 'k', baseUrl: 'https://api.x/v1', model: '' });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('401');
  });
});
