import { afterEach, describe, expect, it } from 'vitest';
import { invoke, isBridgeAvailable, onDispatchEvent } from './ipc';

afterEach(() => {
  delete (window as { workbench?: unknown }).workbench;
});

describe('renderer ipc client', () => {
  it('reports the bridge as unavailable when window.workbench is absent', () => {
    expect(isBridgeAvailable()).toBe(false);
  });

  it('rejects invoke when running without the bridge', async () => {
    await expect(invoke('app.getInfo', {})).rejects.toThrow(/bridge unavailable/i);
  });

  it('returns a no-op unsubscribe when subscribing without the bridge', () => {
    const unsubscribe = onDispatchEvent(() => undefined);
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('uses the bridge when present', async () => {
    (window as unknown as { workbench: unknown }).workbench = {
      invoke: () =>
        Promise.resolve({
          name: 'API Workbench',
          version: '0.1.0',
          electron: '31',
          chrome: '126',
          node: '20',
          platform: 'linux',
        }),
      onDispatchEvent: () => () => undefined,
    };
    expect(isBridgeAvailable()).toBe(true);
    const info = await invoke('app.getInfo', {});
    expect(info.name).toBe('API Workbench');
  });
});
