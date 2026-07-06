import WebSocket, { type RawData } from 'ws';
import type { WsConnection, WsConnector } from './ws-port';

function decode(data: RawData, isBinary: boolean): string {
  if (isBinary) {
    const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    return buffer.toString('base64');
  }
  return data.toString();
}

/** The production WebSocket connector over the `ws` package. */
export function createWsConnector(): WsConnector {
  return {
    connect(url, options) {
      const socket = new WebSocket(url, options.protocols, { headers: options.headers });
      const connection: WsConnection = {
        send(data) {
          socket.send(data);
        },
        close(code, reason) {
          socket.close(code, reason);
        },
        onOpen(handler) {
          socket.on('open', handler);
        },
        onMessage(handler) {
          socket.on('message', (data: RawData, isBinary: boolean) => handler(decode(data, isBinary)));
        },
        onClose(handler) {
          socket.on('close', (code: number, reason: Buffer) =>
            handler({ code, reason: reason.toString() }),
          );
        },
        onError(handler) {
          socket.on('error', handler);
        },
      };
      return connection;
    },
  };
}
