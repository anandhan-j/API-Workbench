/**
 * Port over a WebSocket client (ADR-0009). Isolating the `ws` import behind
 * this interface keeps the native-ish dependency out of the providers and lets
 * tests drive scripted frames through a fake connector.
 */

export interface WsCloseInfo {
  code: number;
  reason: string;
}

export interface WsConnection {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onOpen(handler: () => void): void;
  /** Text frames as-is; binary frames as base64. */
  onMessage(handler: (data: string) => void): void;
  onClose(handler: (info: WsCloseInfo) => void): void;
  onError(handler: (error: Error) => void): void;
}

export interface WsConnectOptions {
  headers: Record<string, string>;
  protocols: string[];
}

export interface WsConnector {
  connect(url: string, options: WsConnectOptions): WsConnection;
}
