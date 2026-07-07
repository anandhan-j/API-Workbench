import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppBridge, AppRpcResult } from './app-bridge.js';
import { registerImportWorkflowToApp } from './tools.js';

const VALID_WORKFLOW = {
  formatVersion: 1,
  exportedAt: 0,
  rootId: 'wf-x',
  workflows: [
    {
      id: 'wf-x',
      name: 'Create post',
      description: null,
      graph: {
        nodes: [
          { id: 'start', kind: 'start', name: 'Start', position: { x: 0, y: 0 }, config: {} },
          { id: 'end', kind: 'end', name: 'End', position: { x: 200, y: 0 }, config: { outcome: 'success' } },
        ],
        edges: [{ id: 'e1', source: 'start', target: 'end' }],
        groups: [],
      },
    },
  ],
};

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

/** Wires an in-memory client to a server exposing only import_workflow_to_app with the given bridge. */
async function connect(bridge: AppBridge): Promise<Client> {
  const server = new McpServer({ name: 'test', version: '1.0' });
  registerImportWorkflowToApp(server, bridge);
  const client = new Client({ name: 'test', version: '1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  cleanups.push(() => void client.close());
  return client;
}

function fakeBridge(available: boolean, result?: AppRpcResult): AppBridge {
  return {
    available,
    call: vi.fn(async () => result ?? { ok: false, error: 'unused' }),
  };
}

describe('import_workflow_to_app (connected)', () => {
  it('imports via the bridge and reports the created workflow', async () => {
    const bridge = fakeBridge(true, { ok: true, result: { id: 'new-1', name: 'Create post' } });
    const client = await connect(bridge);

    const res: any = await client.callTool({
      name: 'import_workflow_to_app',
      arguments: { workflow: VALID_WORKFLOW },
    });

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({ imported: true, workflow: { id: 'new-1', name: 'Create post' } });
    expect(res.content[0].text).toContain('appears in the workflow list');
    expect(bridge.call).toHaveBeenCalledWith('importWorkflow', { workflow: VALID_WORKFLOW });
  });

  it('surfaces a bridge error (e.g. no project open) as a tool error', async () => {
    const bridge = fakeBridge(true, { ok: false, error: 'No project is open in API Workbench.' });
    const client = await connect(bridge);

    const res: any = await client.callTool({
      name: 'import_workflow_to_app',
      arguments: { workflow: VALID_WORKFLOW },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('No project is open');
  });

  it('validates before touching the bridge', async () => {
    const bridge = fakeBridge(true, { ok: true, result: { id: 'x', name: 'x' } });
    const client = await connect(bridge);

    const res: any = await client.callTool({
      name: 'import_workflow_to_app',
      arguments: { workflow: { nope: true } },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('problem');
    expect(bridge.call).not.toHaveBeenCalled();
  });

  it('accepts a JSON string payload', async () => {
    const bridge = fakeBridge(true, { ok: true, result: { id: 'new-2', name: 'Create post' } });
    const client = await connect(bridge);

    const res: any = await client.callTool({
      name: 'import_workflow_to_app',
      arguments: { workflow: JSON.stringify(VALID_WORKFLOW) },
    });

    expect(res.isError).toBeFalsy();
    expect(bridge.call).toHaveBeenCalledWith('importWorkflow', { workflow: VALID_WORKFLOW });
  });
});
