import { describe, expect, it } from 'vitest';
import {
  DispatchEvent,
  IpcChannels,
  INVOKE_CHANNEL_NAMES,
  EVENT_CHANNEL_NAMES,
} from './ipc-contract';

describe('ipc-contract', () => {
  it('exposes every invoke channel in the allowlist', () => {
    expect(INVOKE_CHANNEL_NAMES).toEqual(Object.keys(IpcChannels));
    expect(INVOKE_CHANNEL_NAMES).toContain('app.getInfo');
    expect(INVOKE_CHANNEL_NAMES).toContain('dispatch.getBuffer');
    expect(INVOKE_CHANNEL_NAMES).toContain('dispatch.emit');
  });

  it('declares the dispatch.event push channel', () => {
    expect(EVENT_CHANNEL_NAMES).toContain('dispatch.event');
  });

  it('validates a well-formed dispatch event', () => {
    const result = DispatchEvent.safeParse({
      id: 'abc',
      timestamp: Date.now(),
      level: 'info',
      source: 'app',
      message: 'hello',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an event with an invalid level', () => {
    const result = DispatchEvent.safeParse({
      id: 'abc',
      timestamp: Date.now(),
      level: 'critical',
      source: 'app',
      message: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown property on the emit request', () => {
    const emit = IpcChannels['dispatch.emit'].request;
    const ok = emit.safeParse({ level: 'warn', source: 'x', message: 'y' });
    expect(ok.success).toBe(true);
    const missing = emit.safeParse({ source: 'x', message: 'y' });
    expect(missing.success).toBe(false);
  });
});
