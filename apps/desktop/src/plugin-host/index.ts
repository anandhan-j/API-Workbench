import { SDK_VERSION } from '@shared/plugins';
import type { RpcMessage } from '@shared/plugin-rpc';
import type { RpcWire } from '@shared/plugin-rpc-endpoint';
import { PluginHostRuntime } from './runtime';
import { loadPluginModule } from './module-loader';

/**
 * Entry point of the plugin host utility process (Phase 16, ADR-0010).
 * Spawned by the main process via `utilityProcess.fork`; all communication
 * flows over the built-in parent port. This file is the only Electron-runtime-
 * specific part of the host — everything else lives in the injectable runtime.
 */

interface ParentPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  start?(): void;
}

const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

const wire: RpcWire = {
  send: (message: RpcMessage) => parentPort.postMessage(message),
  onMessage: (handler) => parentPort.on('message', (event) => handler(event.data)),
};

new PluginHostRuntime({
  wire,
  loadModule: loadPluginModule,
  sdkVersion: SDK_VERSION,
});

parentPort.start?.();
