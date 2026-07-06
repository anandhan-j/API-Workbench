import { utilityProcess, type UtilityProcess } from 'electron';
import type { RpcMessage } from '@shared/plugin-rpc';
import type { HostTransport } from './host-transport';

/**
 * Production host transport (Phase 16, ADR-0010): forks the bundled
 * plugin-host entry as an Electron utility process and bridges its parent
 * port to the {@link HostTransport} interface. Imports `electron`, so it is
 * only ever imported from the composition root — never from testable code.
 */
export function createUtilityProcessTransport(hostEntryPath: string): HostTransport {
  const child: UtilityProcess = utilityProcess.fork(hostEntryPath, [], {
    serviceName: 'api-workbench-plugin-host',
  });
  let killed = false;

  return {
    send: (message: RpcMessage) => child.postMessage(message),
    onMessage: (handler) => child.on('message', (message: unknown) => handler(message)),
    onExit: (handler) =>
      child.on('exit', (code: number) => handler({ code, expected: killed })),
    kill: () => {
      killed = true;
      child.kill();
    },
  };
}
