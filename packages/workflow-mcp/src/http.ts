import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { type AddressInfo } from 'node:net';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Runs the MCP server over the Streamable HTTP transport, bound to loopback.
 *
 * This mode exists so a host app (the Electron desktop app) can spawn the server
 * as a managed child process and hand its URL to MCP clients (VS Code, Cursor).
 * Because an HTTP listener is a local attack surface, three protections are
 * mandatory and always on:
 *   - bind to 127.0.0.1 only (never a routable interface);
 *   - require a bearer token (query `?token=` or `Authorization: Bearer`), so a
 *     random web page cannot drive the server even on the same machine;
 *   - reject any request whose `Origin` is a real web origin (DNS-rebinding
 *     defense) — MCP clients send no Origin; browsers do.
 */

const MCP_PATH = '/mcp';
const LOOPBACK_HOST = '127.0.0.1';

export interface TlsMaterial {
  /** PEM-encoded certificate chain. */
  cert: string;
  /** PEM-encoded private key. */
  key: string;
}

export interface HttpServerOptions {
  /** TCP port; 0 asks the OS for a free port (the actual port is returned). */
  port: number;
  /** Shared secret required on every request. */
  token: string;
  /** Builds a fresh McpServer per client session. */
  createServer: () => McpServer;
  /** When provided, serve over HTTPS with this certificate/key instead of HTTP. */
  tls?: TlsMaterial;
}

export interface RunningHttpServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

function tokenValid(req: IncomingMessage, expected: string): boolean {
  const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
  const queryToken = url.searchParams.get('token');
  if (queryToken && timingSafeEqualStr(queryToken, expected)) return true;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return timingSafeEqualStr(auth.slice('Bearer '.length), expected);
  }
  return false;
}

/** Length-independent constant-ish comparison to avoid trivial timing leaks. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Allow requests with no Origin (native MCP clients) or a loopback Origin only. */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isInitialize(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { method?: unknown }).method === 'initialize';
}

function sendError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

export async function startHttpServer(options: HttpServerOptions): Promise<RunningHttpServer> {
  const { token, createServer, tls } = options;
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const requestListener = (req: IncomingMessage, res: ServerResponse): void => {
    void handle(req, res).catch((err: unknown) => {
      if (!res.headersSent) sendError(res, 500, `Internal error: ${(err as Error).message}`);
    });
  };
  const httpServer = tls
    ? createHttpsServer({ cert: tls.cert, key: tls.key }, requestListener)
    : createHttpServer(requestListener);

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!originAllowed(req)) return sendError(res, 403, 'Forbidden origin');
    if (!tokenValid(req, token)) return sendError(res, 401, 'Unauthorized: missing or invalid token');

    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    if (url.pathname !== MCP_PATH) return sendError(res, 404, `Not found; use ${MCP_PATH}`);

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const existing = sessionId ? transports.get(sessionId) : undefined;

    if (existing) {
      await existing.handleRequest(req, res);
      return;
    }

    if (req.method !== 'POST') return sendError(res, 400, 'No active session for this request');

    const body = await readJsonBody(req);
    if (!isInitialize(body)) return sendError(res, 400, 'Expected an initialize request to start a session');

    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, LOOPBACK_HOST, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  const actualPort = (httpServer.address() as AddressInfo).port;
  const scheme = tls ? 'https' : 'http';
  const url = `${scheme}://${LOOPBACK_HOST}:${actualPort}${MCP_PATH}?token=${token}`;

  return {
    url,
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        for (const transport of transports.values()) void transport.close();
        transports.clear();
        httpServer.close(() => resolve());
      }),
  };
}
