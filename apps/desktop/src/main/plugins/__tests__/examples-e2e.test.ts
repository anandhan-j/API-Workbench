// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NodeExecutionEnv } from '../../workflows/node-executors';
import { BUILTIN_NODE_EXECUTORS } from '../../workflows/node-executors';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { NodeExecutorRegistry, pluginNodeKind } from '../registries/node-executor-registry';
import { AuthProviderRegistry } from '../registries/auth-provider-registry';
import { ImporterRegistry } from '../registries/importer-registry';
import { RequestTypeRegistry } from '../registries/request-type-registry';
import { builtinOpenApiImporters, DEFAULT_IMPORTER_ID } from '../../openapi/openapi-importer';
import { ImportService } from '../../openapi/import-service';
import { CapabilityBroker } from '../capability-broker';
import { PluginHostManager } from '../host-manager';
import { InProcessHostTransport } from '../host-transport';
import { PluginService } from '../plugin-service';

/**
 * Phase 16 acceptance: third-party plugins are added without modifying the
 * core. Installs the repository's example plugins (real manifests + real
 * esbuild bundles) through the real loader, activates them in the real host
 * runtime (in-process transport), and drives every extension point end to end.
 */

const EXAMPLES_ROOT = resolve(__dirname, '../../../../../../plugins/examples');

function fakeEnv(runtime: Record<string, string> = {}): NodeExecutionEnv {
  const startedAt = Date.now();
  return {
    ctx: { workflowId: 'wf1', runtime },
    control: { signal: new AbortController().signal, waitIfPaused: () => Promise.resolve() },
    ports: {
      executeRequest: () => Promise.reject(new Error('unused')),
      evaluate: (t) => t,
      loadWorkflow: () => {
        throw new Error('unused');
      },
    },
    base: { nodeId: 'n1', kind: 'plugin', name: 'Plugin node', startedAt },
    done: () => Date.now() - startedAt,
    sleep: () => Promise.resolve(),
    truthy: () => false,
    runSubWorkflow: () => Promise.reject(new Error('unused')),
    loopCounters: new Map(),
  };
}

describe('example plugins end-to-end', () => {
  let dir: string;
  let persistence: PersistenceService;
  let nodes: NodeExecutorRegistry;
  let auth: AuthProviderRegistry;
  let importers: ImporterRegistry;
  let requestTypes: RequestTypeRegistry;
  let host: PluginHostManager;
  let service: PluginService;
  /** Per-test stand-in for the renderer's plugin dialog (default: cancel). */
  let dialogHandler: (request: {
    pluginName: string;
    message: string;
  }) => Promise<{ values: Record<string, unknown>; cancelled: boolean }>;

  beforeAll(() => {
    // Ensure the example bundles exist (idempotent, sub-second).
    const bundled = (name: string): boolean =>
      existsSync(join(EXAMPLES_ROOT, name, 'dist', 'index.cjs'));
    if (!bundled('uuid-node') || !bundled('pick-item-node') || !bundled('approval-dialog-node')) {
      execFileSync(process.execPath, [join(EXAMPLES_ROOT, 'build.mjs')]);
    }
  });

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-e2e-'));
    persistence = new PersistenceService(conn, { backupDir: join(dir, 'backups'), appVersion: '0.1.0' });
    nodes = new NodeExecutorRegistry(BUILTIN_NODE_EXECUTORS);
    auth = new AuthProviderRegistry();
    importers = new ImporterRegistry(builtinOpenApiImporters(), DEFAULT_IMPORTER_ID);
    requestTypes = new RequestTypeRegistry([]);
    dialogHandler = async () => ({ values: {}, cancelled: true });
    const broker = new CapabilityBroker({
      persistence,
      showDialog: (request) => dialogHandler(request),
    });
    host = new PluginHostManager({
      spawn: () => new InProcessHostTransport(),
      broker,
      registries: { nodes, auth, importers, requestTypes },
    });
    service = new PluginService(persistence, {
      installRoot: join(dir, 'plugins'),
      host,
    });
  });

  afterEach(() => {
    host.dispose();
    persistence.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('installs the uuid-node example and executes its node through the registry', async () => {
    const installed = await service.install(join(EXAMPLES_ROOT, 'uuid-node'), []);
    expect(installed.status).toBe('active');

    const kind = pluginNodeKind('com.example.uuid-node', 'uuid');
    const executor = nodes.resolve(kind);
    expect(executor).toBeDefined();

    const env = fakeEnv();
    const outcome = await executor!(
      { id: 'n1', kind, name: 'UUID', position: { x: 0, y: 0 }, config: { variable: 'token' } },
      env,
    );
    expect(outcome.result.status).toBe('success');
    expect(outcome.result.variablesSet?.['token']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('installs the pick-item-node example and picks from its list per strategy', async () => {
    const installed = await service.install(join(EXAMPLES_ROOT, 'pick-item-node'), []);
    expect(installed.status).toBe('active');

    const kind = pluginNodeKind('com.example.pick-item-node', 'pick-item');
    const executor = nodes.resolve(kind);
    expect(executor).toBeDefined();

    const run = async (config: Record<string, unknown>) =>
      executor!(
        { id: 'n1', kind, name: 'Pick', position: { x: 0, y: 0 }, config },
        fakeEnv(),
      );

    const last = await run({
      items: ['alpha', 'beta', 'gamma'],
      strategy: 'last',
      variable: 'picked',
      listVariable: 'pickedList',
    });
    expect(last.result.status).toBe('success');
    expect(last.result.variablesSet?.['picked']).toBe('gamma');
    expect(last.result.variablesSet?.['pickedList']).toBe('["alpha","beta","gamma"]');

    const byIndex = await run({
      items: ['alpha', 'beta', 'gamma'],
      strategy: 'index',
      index: 1,
      variable: 'picked',
      listVariable: '',
    });
    expect(byIndex.result.variablesSet?.['picked']).toBe('beta');
    // Explicitly blank list variable → only the picked item is set.
    expect(byIndex.result.variablesSet).toEqual({ picked: 'beta' });

    const random = await run({
      items: ['alpha', 'beta'],
      strategy: 'random',
      variable: 'picked',
    });
    expect(['alpha', 'beta']).toContain(random.result.variablesSet?.['picked']);
  });

  it('installs the user-input-node example and resolves its typed prompt fields headlessly', async () => {
    const installed = await service.install(join(EXAMPLES_ROOT, 'user-input-node'), []);
    expect(installed.status).toBe('active');

    const kind = pluginNodeKind('com.example.user-input-node', 'user-input');
    const executor = nodes.resolve(kind);
    expect(executor).toBeDefined();

    // fakeEnv has no requestInput port, so the host falls back to each
    // field's default: preset dropdowns (select options / keyvalue entries)
    // resolve to their first choice.
    const outcome = await executor!(
      { id: 'n1', kind, name: 'Ask', position: { x: 0, y: 0 }, config: { trim: true } },
      fakeEnv(),
    );
    expect(outcome.result.status).toBe('success');
    expect(outcome.result.variablesSet).toMatchObject({
      environment: 'staging',
      baseUrl: 'https://staging.example.com',
    });
    expect(outcome.result.message).toBe('Collected input for anonymous');
  });

  it('gates a run behind the approval-dialog-node example (ui:dialog capability)', async () => {
    const installed = await service.install(join(EXAMPLES_ROOT, 'approval-dialog-node'), [
      'ui:dialog',
    ]);
    expect(installed.status).toBe('active');

    const kind = pluginNodeKind('com.example.approval-dialog-node', 'approval-gate');
    const executor = nodes.resolve(kind);
    expect(executor).toBeDefined();

    const run = (config: Record<string, unknown>) =>
      executor!(
        { id: 'n1', kind, name: 'Gate', position: { x: 0, y: 0 }, config },
        fakeEnv(),
      );

    // Approved: the comment lands in the configured variable.
    let seen: { pluginName: string; message: string } | undefined;
    dialogHandler = async (request) => {
      seen = request;
      return { values: { decision: 'approve', comment: 'LGTM' }, cancelled: false };
    };
    const approved = await run({ question: 'Deploy to prod?', variable: 'note' });
    expect(approved.result.status).toBe('success');
    expect(approved.result.variablesSet?.['note']).toBe('LGTM');
    expect(seen?.pluginName).toBe('Approval Dialog Node');
    expect(seen?.message).toBe('Deploy to prod?');

    // Rejected: the node fails the run.
    dialogHandler = async () => ({
      values: { decision: 'reject', comment: 'not yet' },
      cancelled: false,
    });
    await expect(run({ question: 'Deploy?' })).rejects.toThrow(/rejected: not yet/);

    // Cancelled (also the headless outcome): fails closed.
    dialogHandler = async () => ({ values: {}, cancelled: true });
    await expect(run({ question: 'Deploy?' })).rejects.toThrow(/cancelled/);
  });

  it('extends the app with the dropdown-dialog-node example without any host changes', async () => {
    const installed = await service.install(join(EXAMPLES_ROOT, 'dropdown-dialog-node'), [
      'ui:dialog',
    ]);
    expect(installed.status).toBe('active');

    const kind = pluginNodeKind('com.example.dropdown-dialog-node', 'dropdown-picker');
    const executor = nodes.resolve(kind);
    expect(executor).toBeDefined();

    // One dialog: a dropdown from the keyvalue grid plus a dropdown from the
    // `list` field, both built at runtime.
    let form: { fields: Array<{ kind: string; options?: Array<{ value: string }> }> } | undefined;
    dialogHandler = async (request) => {
      form = (request as { form?: typeof form }).form;
      return { values: { choice: 'Staging', listChoice: 'eu-west' }, cancelled: false };
    };

    const outcome = await executor!(
      {
        id: 'n1',
        kind,
        name: 'Pick env',
        position: { x: 0, y: 0 },
        config: {
          items: { Production: 'https://api.example.com', Staging: 'https://staging.example.com' },
          listItems: ['us-east', 'eu-west'],
          variable: 'baseUrl',
          labelVariable: 'envName',
          listVariable: 'region',
        },
      },
      fakeEnv(),
    );
    expect(form?.fields.map((f) => f.kind)).toEqual(['select', 'select']);
    expect(form?.fields[0]?.options?.map((o) => o.value)).toEqual(['Production', 'Staging']);
    expect(form?.fields[1]?.options?.map((o) => o.value)).toEqual(['us-east', 'eu-west']);
    expect(outcome.result.status).toBe('success');
    expect(outcome.result.variablesSet).toEqual({
      baseUrl: 'https://staging.example.com',
      envName: 'Staging',
      region: 'eu-west',
    });

    // Cancelling the dialog fails the node.
    dialogHandler = async () => ({ values: {}, cancelled: true });
    await expect(
      executor!(
        {
          id: 'n1',
          kind,
          name: 'Pick env',
          position: { x: 0, y: 0 },
          config: { items: { A: '1' }, variable: 'v' },
        },
        fakeEnv(),
      ),
    ).rejects.toThrow(/cancelled/);
  });

  it('executes the echo request type and applies plugin auth artifacts to it', async () => {
    await service.install(join(EXAMPLES_ROOT, 'echo-request-type'), []);
    await service.install(join(EXAMPLES_ROOT, 'header-token-auth'), []);

    const provider = requestTypes.resolve('plugin:com.example.echo/echo');
    const payload = provider.payloadSchema.parse({ target: 'demo', message: '{"a":1}' });
    expect(provider.summarize(payload)).toEqual({ badge: 'ECHO', target: 'demo' });

    const authProvider = auth.resolve('plugin:com.example.header-token/header-token');
    const artifacts = await authProvider!.apply(
      { header: 'X-Api-Token', token: 'secret1', prefix: '' },
      { url: 'echo://demo' },
    );
    expect(artifacts.headers['X-Api-Token']).toBe('secret1');

    const response = await provider.execute(payload, {
      artifacts,
      options: { timeoutMs: 5000 },
      evaluate: (t) => t,
    });
    expect(response.ok).toBe(true);
    expect(response.type).toBe('plugin:com.example.echo/echo');
    expect(response.summary).toEqual({ label: 'ECHOED', tone: 'success', code: '0' });
    expect(response.body).toBe('{"a":1}');
    expect(response.metadata['X-Api-Token']).toBe('secret1');
  });

  it('runs the interactive echo request type end-to-end (Phase 7)', async () => {
    await service.install(join(EXAMPLES_ROOT, 'interactive-echo'), []);
    const pluginId = 'com.example.interactive-echo';

    const provider = requestTypes.resolve(`plugin:${pluginId}/chat`);
    expect(provider.summarize({ room: 'general' })).toEqual({ badge: 'CHAT', target: 'general' });

    const events: Array<{ sessionId: string; event: { data: string } }> = [];
    const states: Array<{ sessionId: string; state: string; code?: number }> = [];
    host.onConnectionEvent((p) => events.push(p));
    host.onConnectionState((p) => states.push(p));

    const waitFor = async (predicate: () => boolean, what: string): Promise<void> => {
      const start = Date.now();
      while (!predicate()) {
        if (Date.now() - start > 3000) throw new Error(`Timed out: ${what}`);
        await new Promise((r) => setTimeout(r, 0));
      }
    };

    await host.openConnection({
      sessionId: 's1',
      pluginId,
      type: 'chat',
      payload: { room: 'general', greeting: 'hello' },
    });
    await waitFor(() => states.some((s) => s.state === 'open'), 'open');
    expect(events.some((e) => e.event.data === 'joined general')).toBe(true);
    expect(events.some((e) => e.event.data === 'hello')).toBe(true);

    await host.sendConnection({ sessionId: 's1', pluginId, data: 'ping' });
    await waitFor(() => events.some((e) => e.event.data === 'echo:ping'), 'echo');

    await host.closeConnection({ sessionId: 's1', pluginId });
    await waitFor(() => states.some((s) => s.state === 'closed'), 'closed');
    expect(states.at(-1)).toMatchObject({ state: 'closed', code: 1000 });
  });

  it('imports a CSV through the plugin importer into a real collection', async () => {
    await service.install(join(EXAMPLES_ROOT, 'csv-importer'), []);

    const workspace = persistence.workspaces.create({ name: 'ws' });
    const project = persistence.projects.create({ workspaceId: workspace.id, name: 'p' });
    const imports = new ImportService(persistence, { importers });

    const csv = 'name,method,url,folder\nList users,GET,https://api.test/users,Users\n';
    const result = await imports.import({
      projectId: project.id,
      source: { type: 'text', content: csv },
    });
    expect(result.specVersion).toBe('plugin:com.example.csv-importer/csv');
    expect(result.requestsCreated).toBe(1);
    const requests = persistence.requests.listByCollection(result.collectionId);
    // The generator prefixes every imported URL with the collection's
    // base-URL variable (empty here), same as OpenAPI imports.
    expect(requests[0]).toMatchObject({
      method: 'GET',
      url: '{{CSV_import_baseUrl}}https://api.test/users',
    });
  });

  it('uninstall removes contributions and yields a clear unknown-type error', async () => {
    await service.install(join(EXAMPLES_ROOT, 'echo-request-type'), []);
    expect(requestTypes.has('plugin:com.example.echo/echo')).toBe(true);
    await service.uninstall('com.example.echo');
    expect(requestTypes.has('plugin:com.example.echo/echo')).toBe(false);
    expect(() => requestTypes.resolve('plugin:com.example.echo/echo')).toThrow(
      /disabled or uninstalled/,
    );
  });
});
