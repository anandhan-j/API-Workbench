/**
 * Incremental parser for the `text/event-stream` wire format (ADR-0009).
 *
 * Feed it decoded chunks; it emits one {@link SseEvent} per dispatched event
 * (a blank line). Handles multi-line `data:`, `event:`/`id:`/`retry:` fields,
 * comment lines (leading `:`), and CRLF/CR/LF line endings, per the WHATWG
 * EventSource spec's event-stream interpretation.
 */
export interface SseEvent {
  /** The event name (`event:` field), defaulting to `message`. */
  event: string;
  /** The joined `data:` lines (without the trailing newline). */
  data: string;
  id?: string;
}

export class SseParser {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName = '';
  private lastId: string | undefined;
  private sawData = false;

  /** Feeds a chunk and returns any events completed by it. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    // A trailing lone CR may be the first half of a CRLF split across chunks;
    // hold it back so we don't dispatch a spurious line before the LF arrives.
    let scanEnd = this.buffer.length;
    if (this.buffer.charCodeAt(scanEnd - 1) === 13 /* \r */) scanEnd -= 1;

    let lineStart = 0;
    let i = 0;
    while (i < scanEnd) {
      const code = this.buffer.charCodeAt(i);
      if (code === 10 /* \n */ || code === 13 /* \r */) {
        const event = this.consumeLine(this.buffer.slice(lineStart, i));
        if (event) events.push(event);
        // Treat CRLF as a single terminator.
        if (code === 13 && this.buffer.charCodeAt(i + 1) === 10) i += 1;
        lineStart = i + 1;
      }
      i += 1;
    }
    this.buffer = this.buffer.slice(lineStart);
    return events;
  }

  private consumeLine(line: string): SseEvent | null {
    if (line === '') {
      // Blank line dispatches the accumulated event.
      if (!this.sawData && this.dataLines.length === 0) {
        this.reset();
        return null;
      }
      const event: SseEvent = {
        event: this.eventName || 'message',
        data: this.dataLines.join('\n'),
        ...(this.lastId !== undefined ? { id: this.lastId } : {}),
      };
      this.reset();
      return event;
    }
    if (line.startsWith(':')) return null; // comment
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        this.eventName = value;
        break;
      case 'data':
        this.dataLines.push(value);
        this.sawData = true;
        break;
      case 'id':
        if (!value.includes('\0')) this.lastId = value;
        break;
      case 'retry':
        break;
      default:
        break;
    }
    return null;
  }

  private reset(): void {
    this.dataLines = [];
    this.eventName = '';
    this.sawData = false;
  }
}
