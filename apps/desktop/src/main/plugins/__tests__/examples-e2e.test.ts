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

  beforeAll(() => {
    // Ensure the example bundles exist (idempotent, sub-second).
    if (!existsSync(join(EXAMPLES_ROOT, 'uuid-node', 'dist', 'index.cjs'))) {
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
    const broker = new CapabilityBroker({ persistence });
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
