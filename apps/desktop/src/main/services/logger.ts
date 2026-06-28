import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { DispatchEvent, LogLevel } from '@shared/ipc-contract';

/**
 * Structured, in-memory dispatch logger for the main process.
 *
 * It buffers a bounded window of recent events and emits each new event so the
 * IPC layer can forward it to the renderer's dispatch monitor. It is intentionally
 * free of any Electron import so it can be unit-tested in isolation.
 *
 * Secret values must be redacted by callers; as a backstop, keys matching the
 * redaction pattern are masked here before an event is recorded.
 */

const REDACT_KEY = /(secret|token|password|authorization|apikey|api_key|credential)/i;
const REDACTED = '[redacted]';

export interface LoggerOptions {
  /** Maximum number of events kept in the ring buffer. */
  bufferSize?: number;
}

function redact(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = REDACT_KEY.test(key) ? REDACTED : value;
  }
  return out;
}

export class DispatchLogger extends EventEmitter {
  private readonly buffer: DispatchEvent[] = [];
  private readonly bufferSize: number;

  constructor(options: LoggerOptions = {}) {
    super();
    this.bufferSize = options.bufferSize ?? 500;
  }

  log(
    level: LogLevel,
    source: string,
    message: string,
    context?: Record<string, unknown>,
  ): DispatchEvent {
    const event: DispatchEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      level,
      source,
      message,
      ...(context ? { context: redact(context) } : {}),
    };

    this.buffer.push(event);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, this.buffer.length - this.bufferSize);
    }

    // Structured JSON line to stdout for external capture.
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](JSON.stringify(event));
    this.emit('event', event);
    return event;
  }

  debug(source: string, message: string, context?: Record<string, unknown>): DispatchEvent {
    return this.log('debug', source, message, context);
  }

  info(source: string, message: string, context?: Record<string, unknown>): DispatchEvent {
    return this.log('info', source, message, context);
  }

  warn(source: string, message: string, context?: Record<string, unknown>): DispatchEvent {
    return this.log('warn', source, message, context);
  }

  error(source: string, message: string, context?: Record<string, unknown>): DispatchEvent {
    return this.log('error', source, message, context);
  }

  /** Snapshot of buffered events, oldest first. */
  getBuffer(): DispatchEvent[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer.length = 0;
  }
}

/** Shared singleton used across the main process. */
export const logger = new DispatchLogger();
