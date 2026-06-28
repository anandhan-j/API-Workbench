import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DispatchLogger } from './logger';

describe('DispatchLogger', () => {
  let log: DispatchLogger;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    log = new DispatchLogger({ bufferSize: 3 });
  });

  it('records events and returns them with id + timestamp', () => {
    const event = log.info('app', 'started');
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeGreaterThan(0);
    expect(log.getBuffer()).toHaveLength(1);
  });

  it('emits an "event" for each log call', () => {
    const listener = vi.fn();
    log.on('event', listener);
    log.warn('ipc', 'careful');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({ level: 'warn', source: 'ipc' });
  });

  it('enforces the ring-buffer bound', () => {
    log.info('a', '1');
    log.info('a', '2');
    log.info('a', '3');
    log.info('a', '4');
    const buffer = log.getBuffer();
    expect(buffer).toHaveLength(3);
    expect(buffer[0].message).toBe('2');
    expect(buffer[2].message).toBe('4');
  });

  it('redacts sensitive context keys', () => {
    const event = log.info('auth', 'token issued', { token: 'super-secret', userId: 7 });
    expect(event.context).toEqual({ token: '[redacted]', userId: 7 });
  });

  it('clears the buffer', () => {
    log.info('a', '1');
    log.clear();
    expect(log.getBuffer()).toHaveLength(0);
  });
});
