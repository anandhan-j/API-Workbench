import type { RpcMessage } from '@shared/plugin-rpc';
import type { RpcWire } from '@shared/plugin-rpc-endpoint';
import { SDK_VERSION } from '@shared/plugins';
import { PluginHostRuntime } from '../../plugin-host/runtime';
import { loadPluginModule } from '../../plugin-host/module-loader';

/**
 * The transport seam between the host manager and the plugin host process
 * (Phase 16, ADR-0010). Production uses `UtilityProcessTransport`
 * (host-transport-electron.ts); tests use {@link InProcessHostTransport},
 * which runs the real {@link PluginHostRuntime} in-process over an in-memory
 * wire — same protocol, no Electron, fully deterministic.
 */

export interface HostTransport extends RpcWire {
  onExit(handler: (info: { code: number; expected: boolean }) => void): void;
  kill(): void;
}

/** Spawns a transport; called on first activation and on every respawn. */
export type SpawnHostTransport = () => HostTransport;

interface InProcessOptions {
  loadModule?: (entryPath: string) => unknown;
  fetchImpl?: typeof fetch;
}

export class InProcessHostTransport implements HostTransport {
  private mainHandler: ((message: unknown) => void) | undefined;
  private exitHandler: ((info: { code: number; expected: boolean }) => void) | undefined;
  private hostHandler: ((message: unknown) => void) | undefined;
  private killed = false;

  constructor(options: InProcessOptions = {}) {
    const hostWire: RpcWire = {
      // Host → main. Queue a microtask so delivery is async like a real port.
      send: (message) => queueMicrotask(() => this.mainHandler?.(message)),
      onMessage: (handler) => {
        this.hostHandler = handler;
      },
    };
    new PluginHostRuntime({
      wire: hostWire,
      loadModule: options.loadModule ?? loadPluginModule,
      sdkVersion: SDK_VERSION,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }

  send(message: RpcMessage): void {
    if (this.killed) return;
    queueMicrotask(() => this.hostHandler?.(message));
  }

  onMessage(handler: (message: unknown) => void): void {
    this.mainHandler = handler;
  }

  onExit(handler: (info: { code: number; expected: boolean }) => void): void {
    this.exitHandler = handler;
  }

  kill(): void {
    this.killed = true;
    this.exitHandler?.({ code: 0, expected: true });
  }

  /** Test hook: simulate the host process dying unexpectedly. */
  simulateCrash(code = 1): void {
    this.killed = true;
    this.exitHandler?.({ code, expected: false });
  }
}
