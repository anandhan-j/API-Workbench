// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { StreamProtocolExtras, type StreamEvent } from '@shared/protocol';
import { buildStreamResponse, type StreamCollection } from '../streams/collect';

function ev(direction: StreamEvent['direction'], data: string): StreamEvent {
  return { at: 0, direction, kind: 'text', data };
}

function collection(over: Partial<StreamCollection> = {}): StreamCollection {
  return {
    type: 'websocket',
    events: [],
    startedAt: 0,
    totalMs: 5,
    connected: true,
    ...over,
  };
}

describe('buildStreamResponse', () => {
  it('puts only received message data into the JSON body, JSON-parsed where possible', () => {
    const response = buildStreamResponse(
      collection({
        events: [
          ev('info', 'connected'),
          ev('sent', 'ping'),
          ev('received', '{"n":1}'),
          ev('received', 'plain text'),
        ],
      }),
    );
    expect(JSON.parse(response.body)).toEqual([{ n: 1 }, 'plain text']);
    expect(response.bodyKind).toBe('json');
  });

  it('carries the full directional timeline in the extras', () => {
    const events = [ev('info', 'connected'), ev('sent', 'a'), ev('received', 'b')];
    const response = buildStreamResponse(collection({ events }));
    expect(StreamProtocolExtras.parse(response.protocol).events).toEqual(events);
  });

  it('is ok when connected without error, and labels a clean close with its code', () => {
    const response = buildStreamResponse(
      collection({ events: [ev('received', 'x')], closeCode: 1000 }),
    );
    expect(response.ok).toBe(true);
    expect(response.summary.tone).toBe('success');
    expect(response.summary.label).toBe('Closed 1000 · 1 message');
  });

  it('labels a truncated collection', () => {
    const response = buildStreamResponse(
      collection({ events: [ev('received', 'a'), ev('received', 'b')], truncated: true }),
    );
    expect(response.summary.label).toBe('2 messages (truncated)');
    expect(StreamProtocolExtras.parse(response.protocol).truncated).toBe(true);
  });

  it('marks an errored collection failed', () => {
    const response = buildStreamResponse(collection({ connected: false, error: 'refused' }));
    expect(response.ok).toBe(false);
    expect(response.error).toBe('refused');
    expect(response.summary.tone).toBe('error');
  });

  it('marks a cancelled collection with info tone', () => {
    const response = buildStreamResponse(collection({ cancelled: true }));
    expect(response.cancelled).toBe(true);
    expect(response.summary.tone).toBe('info');
    expect(response.summary.label).toBe('Cancelled');
  });

  it('surfaces SSE handshake metadata', () => {
    const response = buildStreamResponse(
      collection({ type: 'sse', metadata: { 'content-type': 'text/event-stream' } }),
    );
    expect(response.metadata['content-type']).toBe('text/event-stream');
    expect(response.type).toBe('sse');
  });
});
