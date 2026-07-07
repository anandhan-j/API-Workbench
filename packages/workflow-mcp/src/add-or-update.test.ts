import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';

import { createServer } from './server.js';

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

interface ElicitResponse {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

/**
 * Links an in-memory client↔server. When `elicit` is provided the client
 * advertises the elicitation capability and answers prompts with it; otherwise
 * the client cannot be prompted (exercising the confirmUpdate fallback).
 */
async function connect(elicit?: { respond: (message: string) => ElicitResponse }): Promise<{
  client: Client;
  prompts: string[];
}> {
  const prompts: string[] = [];
  const client = new Client(
    { name: 'test', version: '1.0' },
    elicit ? { capabilities: { elicitation: {} } } : undefined,
  );
  if (elicit) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      const message = (req.params as { message: string }).message;
      prompts.push(message);
      return elicit.respond(message);
    });
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  await client.connect(clientTransport);
  cleanups.push(() => void client.close());
  return { client, prompts };
}

function tmpFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wf-mcp-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'x.workflow.json');
}

describe('add_or_update_workflow', () => {
  it('creates a new file with no confirmation', async () => {
    const { client, prompts } = await connect();
    const path = tmpFile();

    const res: any = await client.callTool({
      name: 'add_or_update_workflow',
      arguments: { path, workflow: VALID_WORKFLOW },
    });

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent.action).toBe('created');
    expect(prompts).toHaveLength(0); // no prompt for a brand-new file
    expect(JSON.parse(readFileSync(path, 'utf8')).rootId).toBe('wf-x');
  });

  it('overwrites an existing file only after the user accepts the prompt', async () => {
    const { client, prompts } = await connect({ respond: () => ({ action: 'accept', content: { confirm: true } }) });
    const path = tmpFile();
    writeFileSync(path, JSON.stringify({ rootId: 'old', workflows: [] }), 'utf8');

    const res: any = await client.callTool({
      name: 'add_or_update_workflow',
      arguments: { path, workflow: VALID_WORKFLOW },
    });

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent.action).toBe('updated');
    expect(prompts[0]).toContain('overwrite an existing workflow file');
    expect(prompts[0]).toContain('Create post');
    expect(JSON.parse(readFileSync(path, 'utf8')).rootId).toBe('wf-x');
  });

  it('leaves the file unchanged when the user declines', async () => {
    const { client } = await connect({ respond: () => ({ action: 'decline' }) });
    const path = tmpFile();
    writeFileSync(path, JSON.stringify({ rootId: 'old', workflows: [] }), 'utf8');

    const res: any = await client.callTool({
      name: 'add_or_update_workflow',
      arguments: { path, workflow: VALID_WORKFLOW },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('left unchanged');
    expect(JSON.parse(readFileSync(path, 'utf8')).rootId).toBe('old'); // untouched
  });

  it('leaves the file unchanged when the user accepts but answers no', async () => {
    const { client } = await connect({ respond: () => ({ action: 'accept', content: { confirm: false } }) });
    const path = tmpFile();
    writeFileSync(path, JSON.stringify({ rootId: 'old', workflows: [] }), 'utf8');

    const res: any = await client.callTool({
      name: 'add_or_update_workflow',
      arguments: { path, workflow: VALID_WORKFLOW },
    });

    expect(res.isError).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')).rootId).toBe('old');
  });

  it('refuses to overwrite without confirmUpdate when the client cannot be prompted', async () => {
    const { client } = await connect(); // no elicitation capability
    const path = tmpFile();
    writeFileSync(path, JSON.stringify({ rootId: 'old', workflows: [] }), 'utf8');

    const res: any = await client.callTool({
      name: 'add_or_update_workflow',
      arguments: { path, workflow: VALID_WORKFLOW },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('confirmUpdate');
    expect(JSON.parse(readFileSync(path, 'utf8')).rootId).toBe('old'); // untouched
  });

  it('overwrites with confirmUpdate: true when the client cannot be prompted', async () => {
    const { client } = await connect();
    const path = tmpFile();
    writeFileSync(path, JSON.stringify({ rootId: 'old', workflows: [] }), 'utf8');

    const res: any = await client.callTool({
      name: 'add_or_update_workflow',
      arguments: { path, workflow: VALID_WORKFLOW, confirmUpdate: true },
    });

    expect(res.isError).toBeFalsy();
    expect(res.structuredContent.action).toBe('updated');
    expect(JSON.parse(readFileSync(path, 'utf8')).rootId).toBe('wf-x');
  });

  it('never writes an invalid workflow', async () => {
    const { client } = await connect();
    const path = tmpFile();

    const res: any = await client.callTool({
      name: 'add_or_update_workflow',
      arguments: { path, workflow: { nope: true } },
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('problem');
    expect(existsSync(path)).toBe(false); // nothing written
  });
});

describe('import_workflow_to_app (no app bridge)', () => {
  it('is listed and reports it is not connected to a running app', async () => {
    // WORKFLOW_MCP_APP_BRIDGE is unset in the test env, so the bridge is unavailable.
    const { client } = await connect();

    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain('import_workflow_to_app');

    const res: any = await client.callTool({
      name: 'import_workflow_to_app',
      arguments: { workflow: VALID_WORKFLOW },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Not connected to a running API Workbench app');
  });
});
