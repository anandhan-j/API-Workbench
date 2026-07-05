// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SseParser } from '../streams/sse-parser';

describe('SseParser', () => {
  it('emits a simple data event on a blank line', () => {
    const parser = new SseParser();
    expect(parser.push('data: hello\n\n')).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('joins multi-line data and carries the event name and id', () => {
    const parser = new SseParser();
    const events = parser.push('event: tick\nid: 7\ndata: a\ndata: b\n\n');
    expect(events).toEqual([{ event: 'tick', data: 'a\nb', id: '7' }]);
  });

  it('buffers events split across chunk boundaries', () => {
    const parser = new SseParser();
    expect(parser.push('data: par')).toEqual([]);
    expect(parser.push('tial\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'message', data: 'partial' }]);
  });

  it('ignores comment lines and handles CRLF endings', () => {
    const parser = new SseParser();
    const events = parser.push(': keep-alive\r\ndata: x\r\n\r\n');
    expect(events).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('parses multiple events in one chunk', () => {
    const parser = new SseParser();
    const events = parser.push('data: 1\n\ndata: 2\n\n');
    expect(events.map((e) => e.data)).toEqual(['1', '2']);
  });
});
