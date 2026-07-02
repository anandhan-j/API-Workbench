// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginContext } from '@api-workbench/plugin-sdk';
import { PluginManifest } from '@shared/plugins';
import type { WorkflowNode } from '@shared/workflow';
import { RpcCallError } from '@shared/plugin-rpc-endpoint';
import type { NodeExecutionEnv } from '../../workflows/node-executors';
import { BUILTIN_NODE_EXECUTORS } from '../../workflows/node-executors';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { NodeExecutorRegistry, pluginNodeKind } from '../registries/node-executor-registry';
import { AuthProviderRegistry, pluginAuthType } from '../registries/auth-provider-registry';
import { ImporterRegistry, pluginImporterId } from '../registries/importer-registry';
import { RequestTypeRegistry, pluginRequestType } from '../registries/request-type-registry';
import { builtinOpenApiImporters, DEFAULT_IMPORTER_ID } from '../../openapi/openapi-importer';
import { CapabilityBroker } from '../capability-broker';
import { PluginHostManager } from '../host-manager';
import { InProcessHostTransport, type HostTransport } from '../host-transport';

/**
 * Host lifecycle, capability enforcement, and crash/restart policy —
 * everything examples-e2e (happy path with real bundles) does not cover.
 * Plugins here are in-memory objects served by an injected module loader.
 */

function makeManifest(id: string, overrides: Record<string, unknown> = {}): PluginManifest {
  return PluginManifest.parse({
    manifestVersion: 1,
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    main: 'dist/index.cjs',
    engines: { sdk: '^1.0.0' },
    ...overrides,
  });
}

function fakeEnv(runtime: Record<string, string> = {}, signal?: AbortSignal): NodeExecutionEnv {
  const startedAt = Date.now();
  return {
    ctx: { workflowId: 'wf1', runtime },
    control: {
      signal: signal ?? new AbortController().signal,
      waitIfPaused: () => Promise.resolve(),
    },
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

function node(kind: string, config: Record<string, unknown>): WorkflowNode {
  return { id: 'n1', kind, name: 'N', position: { x: 0, y: 0 }, config };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function waitUntil(predicate: () => boolean, what: string): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 3000) throw new Error(`Timed out waiting for ${what}`);
    await flush();
  }
}

describe('plugin host lifecycle', () => {
  let dir: string;
  let persistence: PersistenceService;
  let nodes: NodeExecutorRegistry;
  let auth: AuthProviderRegistry;
  let importers: ImporterRegistry;
  let requestTypes: RequestTypeRegistry;
  let manager: PluginHostManager;
  let broker: CapabilityBroker;
  let modules: Record<string, unknown>;
  let transports: InProcessHostTransport[];
  let deadSpawn: boolean;
  let changes: string[];
  let sleeps: number[];
  let brokerLog: ReturnType<
    typeof vi.fn<(level: 'info' | 'warn' | 'error', message: string, context?: object) => void>
  >;
  let setVariable: ReturnType<
    typeof vi.fn<(scope: 'workspace' | 'global', key: string, value: string) => void>
  >;

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-host-'));
    persistence = new PersistenceService(conn, {
      backupDir: join(dir, 'backups'),
      appVersion: '0.1.0',
    });
    nodes = new NodeExecutorRegistry(BUILTIN_NODE_EXECUTORS);
    auth = new AuthProviderRegistry();
    importers = new ImporterRegistry(builtinOpenApiImporters(), DEFAULT_IMPORTER_ID);
    requestTypes = new RequestTypeRegistry([]);
    modules = {};
    transports = [];
    deadSpawn = false;
    changes = [];
    sleeps = [];
    brokerLog = vi.fn<(level: 'info' | 'warn' | 'error', message: string, context?: object) => void>();
    setVariable = vi.fn<(scope: 'workspace' | 'global', key: string, value: string) => void>();
    broker = new CapabilityBroker({
      persistence,
      evaluate: (template) => template.replace('{{name}}', 'world'),
      setVariable,
      log: brokerLog,
    });
    manager = new PluginHostManager({
      spawn: () => {
        if (deadSpawn) {
          // A transport whose host never sends host.ready.
          const dead: HostTransport = {
            send: () => undefined,
            onMessage: () => undefined,
            onExit: () => undefined,
            kill: () => undefined,
          };
          return dead;
        }
        const transport = new InProcessHostTransport({
          loadModule: (entryPath) => {
            const mod = modules[entryPath];
            if (!mod) throw new Error(`No module for ${entryPath}`);
            return mod;
          },
        });
        transports.push(transport);
        return transport;
      },
      broker,
      registries: { nodes, auth, importers, requestTypes },
      onChanged: (reason) => changes.push(reason),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
  });

  afterEach(() => {
    manager.dispose();
    persistence.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function defineModule(id: string, activate: (ctx: PluginContext) => void | Promise<void>): void {
    modules[`mem://${id}`] = { default: { activate } };
  }

  function activate(id: string, manifest: PluginManifest, caps: string[] = []): Promise<void> {
    return manager.activate({
      pluginId: id,
      entryPath: `mem://${id}`,
      grantedCapabilities: caps as PluginManifest['capabilities'],
      manifest,
    });
  }

  const stringField = (key: string, required = true) => ({
    key,
    label: key,
    kind: 'string' as const,
    required,
  });

  it('rejects activation when a declared contribution was not registered', async () => {
    const id = 'com.acme.lazy';
    const manifest = makeManifest(id, {
      contributes: {
        nodes: [{ kind: 'declared', label: 'Declared', configSchema: { fields: [] } }],
      },
    });
    defineModule(id, () => {
      /* registers nothing */
    });

    await expect(activate(id, manifest)).rejects.toThrow(
      /did not register declared contributions: node "declared"/,
    );
    expect(manager.statusOf(id)).toMatchObject({ status: 'error' });
    expect(nodes.resolve(pluginNodeKind(id, 'declared'))).toBeUndefined();
    expect(changes).toContain('activation-failed');
  });

  it('rejects activation when the plugin registers an undeclared contribution', async () => {
    const id = 'com.acme.rogue';
    const manifest = makeManifest(id); // declares nothing
    defineModule(id, (ctx) => {
      ctx.registerNodeExecutor('surprise', { execute: () => Promise.resolve({}) });
    });

    await expect(activate(id, manifest)).rejects.toThrow(
      /activate\(\) failed: .*"surprise".*not declared in the manifest/,
    );
    expect(manager.statusOf(id)).toMatchObject({ status: 'error' });
    expect(nodes.resolve(pluginNodeKind(id, 'surprise'))).toBeUndefined();
  });

  it('rejects node execution whose config fails the compiled form schema', async () => {
    const id = 'com.acme.forms';
    const manifest = makeManifest(id, {
      contributes: {
        nodes: [
          { kind: 'greet', label: 'Greet', configSchema: { fields: [stringField('name')] } },
        ],
      },
    });
    defineModule(id, (ctx) => {
      ctx.registerNodeExecutor('greet', {
        execute: (input) =>
          Promise.resolve({
            message: `hi ${String(input.config['name'])}`,
            variables: { greeted: String(input.config['name']) },
          }),
      });
    });
    await activate(id, manifest);

    const executor = nodes.resolve(pluginNodeKind(id, 'greet'))!;
    // Missing required config never reaches the plugin.
    await expect(
      Promise.resolve(executor(node(pluginNodeKind(id, 'greet'), {}), fakeEnv())),
    ).rejects.toThrow();

    const outcome = await executor(
      node(pluginNodeKind(id, 'greet'), { name: 'bob' }),
      fakeEnv(),
    );
    expect(outcome.result.status).toBe('success');
    expect(outcome.result.message).toBe('hi bob');
    expect(outcome.result.variablesSet).toEqual({ greeted: 'bob' });
  });

  it('honors the branch handle only for branching contributions', async () => {
    const id = 'com.acme.branch';
    const manifest = makeManifest(id, {
      contributes: {
        nodes: [
          { kind: 'router', label: 'Router', configSchema: { fields: [] }, branching: true },
          { kind: 'plain', label: 'Plain', configSchema: { fields: [] } },
        ],
      },
    });
    defineModule(id, (ctx) => {
      const executor = { execute: () => Promise.resolve({ branch: 'yes' }) };
      ctx.registerNodeExecutor('router', executor);
      ctx.registerNodeExecutor('plain', executor);
    });
    await activate(id, manifest);

    const router = await nodes.resolve(pluginNodeKind(id, 'router'))!(
      node(pluginNodeKind(id, 'router'), {}),
      fakeEnv(),
    );
    expect(router.handle).toBe('yes');

    const plain = await nodes.resolve(pluginNodeKind(id, 'plain'))!(
      node(pluginNodeKind(id, 'plain'), {}),
      fakeEnv(),
    );
    expect(plain.handle).toBeNull();
  });

  it('round-trips ctx.storage through the broker and enforces quotas', async () => {
    const id = 'com.acme.store';
    const manifest = makeManifest(id);
    persistence.plugins.save({
      manifest,
      grantedCapabilities: [],
      installPath: '/mem',
      devMode: false,
    });
    let ctx: PluginContext | undefined;
    defineModule(id, (context) => {
      ctx = context;
    });
    await activate(id, manifest);

    await ctx!.storage.set('k', 'v1');
    expect(persistence.pluginStorage.get(id, 'k')).toBe('v1');
    await expect(ctx!.storage.get('k')).resolves.toBe('v1');
    await ctx!.storage.delete('k');
    await expect(ctx!.storage.get('k')).resolves.toBeUndefined();

    // Value quota: > 1 MB rejected by the broker.
    await expect(ctx!.storage.set('big', 'x'.repeat(1024 * 1024 + 1))).rejects.toThrow(/1 MB/);

    // Key-count quota: seed 200 keys directly, then the 201st insert fails…
    for (let i = 0; i < 200; i += 1) persistence.pluginStorage.set(id, `k${i}`, 'v');
    await expect(ctx!.storage.set('overflow', 'v')).rejects.toThrow(/at most 200 keys/);
    // …but updating an existing key is still allowed.
    await expect(ctx!.storage.set('k0', 'updated')).resolves.toBeUndefined();
    expect(persistence.pluginStorage.get(id, 'k0')).toBe('updated');
  });

  it('storage calls for a plugin that is not installed are rejected', async () => {
    const id = 'com.acme.ghost';
    const manifest = makeManifest(id);
    let ctx: PluginContext | undefined;
    defineModule(id, (context) => {
      ctx = context;
    });
    await activate(id, manifest); // activated in the host, but no persisted row
    await expect(ctx!.storage.set('k', 'v')).rejects.toThrow(/not installed/);
  });

  it('exposes ctx.variables only when granted, and the broker re-checks persisted grants', async () => {
    // No grant: the member is absent entirely.
    const plainId = 'com.acme.novars';
    const plainManifest = makeManifest(plainId);
    let plainCtx: PluginContext | undefined;
    defineModule(plainId, (context) => {
      plainCtx = context;
    });
    await activate(plainId, plainManifest);
    expect(plainCtx!.variables).toBeUndefined();

    // Activated with a grant the persisted row does NOT have: broker denies.
    const liarId = 'com.acme.liar';
    const liarManifest = makeManifest(liarId, { capabilities: ['variables:read'] });
    persistence.plugins.save({
      manifest: liarManifest,
      grantedCapabilities: [], // user never granted it
      installPath: '/mem',
      devMode: false,
    });
    let liarCtx: PluginContext | undefined;
    defineModule(liarId, (context) => {
      liarCtx = context;
    });
    await activate(liarId, liarManifest, ['variables:read']);
    expect(liarCtx!.variables).toBeDefined();
    await expect(liarCtx!.variables!.resolve('{{name}}')).rejects.toThrow(/not granted/);

    // Properly granted: resolve and set flow through the injected ports.
    const okId = 'com.acme.vars';
    const okManifest = makeManifest(okId, {
      capabilities: ['variables:read', 'variables:write'],
    });
    persistence.plugins.save({
      manifest: okManifest,
      grantedCapabilities: ['variables:read', 'variables:write'],
      installPath: '/mem',
      devMode: false,
    });
    let okCtx: PluginContext | undefined;
    defineModule(okId, (context) => {
      okCtx = context;
    });
    await activate(okId, okManifest, ['variables:read', 'variables:write']);
    await expect(okCtx!.variables!.resolve('hello {{name}}')).resolves.toBe('hello world');
    await okCtx!.variables!.set('workspace', 'answer', '42');
    expect(setVariable).toHaveBeenCalledWith('workspace', 'answer', '42');
  });

  it('write-only grants still reject reads (and vice versa) inside the host gate', async () => {
    const id = 'com.acme.wronly';
    const manifest = makeManifest(id, { capabilities: ['variables:write'] });
    persistence.plugins.save({
      manifest,
      grantedCapabilities: ['variables:write'],
      installPath: '/mem',
      devMode: false,
    });
    let ctx: PluginContext | undefined;
    defineModule(id, (context) => {
      ctx = context;
    });
    await activate(id, manifest, ['variables:write']);
    await expect(ctx!.variables!.resolve('x')).rejects.toThrow(/variables:read.*not granted/);
  });

  it('aborting env.control.signal cancels the RPC and aborts the plugin signal', async () => {
    const id = 'com.acme.slow';
    const manifest = makeManifest(id, {
      contributes: {
        nodes: [{ kind: 'wait', label: 'Wait', configSchema: { fields: [] } }],
      },
    });
    let pluginSawAbort = false;
    defineModule(id, (ctx) => {
      ctx.registerNodeExecutor('wait', {
        execute: (input) =>
          new Promise((_resolve, reject) => {
            input.signal.addEventListener('abort', () => {
              pluginSawAbort = true;
              reject(new Error('aborted in plugin'));
            });
          }),
      });
    });
    await activate(id, manifest);

    const controller = new AbortController();
    const executor = nodes.resolve(pluginNodeKind(id, 'wait'))!;
    const running = Promise.resolve(
      executor(node(pluginNodeKind(id, 'wait'), {}), fakeEnv({}, controller.signal)),
    );
    const outcome = running.catch((error: unknown) => error);
    await flush(); // the RPC is now in flight
    controller.abort();

    const error = await outcome;
    expect(error).toBeInstanceOf(RpcCallError);
    expect((error as RpcCallError).code).toBe('E_RPC_CANCELLED');
    await waitUntil(() => pluginSawAbort, 'plugin abort');
  });

  it('crash rejects in-flight calls, marks host-failed, unregisters, then respawns and recovers', async () => {
    const id = 'com.acme.crashy';
    const manifest = makeManifest(id, {
      contributes: {
        nodes: [{ kind: 'work', label: 'Work', configSchema: { fields: [] } }],
        authProviders: [{ type: 'sig', label: 'Sig', configSchema: { fields: [] } }],
        importers: [{ id: 'imp', label: 'Imp', sourceTypes: ['text'] }],
        requestTypes: [
          {
            type: 'echo',
            label: 'Echo',
            payloadSchema: { fields: [stringField('target', false)] },
            summary: { badge: 'ECHO', targetKey: 'target' },
          },
        ],
      },
    });
    let hang = true;
    defineModule(id, (ctx) => {
      ctx.registerNodeExecutor('work', {
        execute: () =>
          hang ? new Promise(() => undefined) : Promise.resolve({ message: 'done' }),
      });
      ctx.registerAuthProvider('sig', {
        apply: () => Promise.resolve({ headers: {}, query: {}, cookies: {} }),
      });
      ctx.registerImporter('imp', {
        detect: () => false,
        parse: () => Promise.reject(new Error('unused')),
      });
      ctx.registerRequestType('echo', {
        execute: () => Promise.reject(new Error('unused')),
      });
    });
    await activate(id, manifest);
    expect(manager.statusOf(id)).toEqual({ status: 'active' });

    const executor = nodes.resolve(pluginNodeKind(id, 'work'))!;
    const inFlight = Promise.resolve(
      executor(node(pluginNodeKind(id, 'work'), {}), fakeEnv()),
    ).catch((error: unknown) => error);
    await flush();

    hang = false; // the respawned host resolves instead of hanging
    transports.at(-1)!.simulateCrash(9);

    // Synchronously after the crash: failed status, contributions gone.
    const failed = manager.statusOf(id);
    expect(failed.status).toBe('host-failed');
    expect(failed.message).toContain('code 9');
    expect(nodes.resolve(pluginNodeKind(id, 'work'))).toBeUndefined();
    expect(auth.resolve(pluginAuthType(id, 'sig'))).toBeUndefined();
    expect(importers.ids()).not.toContain(pluginImporterId(id, 'imp'));
    expect(requestTypes.has(pluginRequestType(id, 'echo'))).toBe(false);

    const error = await inFlight;
    expect(error).toBeInstanceOf(RpcCallError);
    expect((error as RpcCallError).code).toBe('E_HOST_CRASHED');

    // The injected sleep makes backoff instant; wait for the restart to finish.
    await waitUntil(() => changes.includes('host-restarted'), 'host restart');
    expect(sleeps).toEqual([1000]); // first restart backs off 1s (2^0)
    expect(transports).toHaveLength(2);
    expect(manager.statusOf(id)).toEqual({ status: 'active' });

    const revived = nodes.resolve(pluginNodeKind(id, 'work'))!;
    const outcome = await revived(node(pluginNodeKind(id, 'work'), {}), fakeEnv());
    expect(outcome.result.status).toBe('success');
    expect(outcome.result.message).toBe('done');
  });

  it('gives up after the restart limit within the window', async () => {
    const id = 'com.acme.doomed';
    const manifest = makeManifest(id, {
      contributes: { nodes: [{ kind: 'k', label: 'K', configSchema: { fields: [] } }] },
    });
    defineModule(id, (ctx) => {
      ctx.registerNodeExecutor('k', { execute: () => Promise.resolve({}) });
    });
    await activate(id, manifest);

    for (let crash = 1; crash <= 3; crash += 1) {
      const restartsBefore = changes.filter((c) => c === 'host-restarted').length;
      transports.at(-1)!.simulateCrash();
      await waitUntil(
        () => changes.filter((c) => c === 'host-restarted').length > restartsBefore,
        `restart #${crash}`,
      );
      expect(manager.statusOf(id)).toEqual({ status: 'active' });
    }
    expect(sleeps).toEqual([1000, 2000, 4000]); // exponential backoff

    // Fourth crash inside the window: no further restart.
    transports.at(-1)!.simulateCrash();
    await waitUntil(() => changes.includes('host-failed'), 'give-up signal');
    expect(manager.statusOf(id)).toMatchObject({ status: 'host-failed' });
    expect(transports).toHaveLength(4); // initial + 3 respawns, no 5th spawn
    expect(nodes.resolve(pluginNodeKind(id, 'k'))).toBeUndefined();
  });

  it('deactivate removes registry entries and host state', async () => {
    const id = 'com.acme.gone';
    const manifest = makeManifest(id, {
      contributes: {
        nodes: [{ kind: 'k', label: 'K', configSchema: { fields: [] } }],
        authProviders: [{ type: 'a', label: 'A', configSchema: { fields: [] } }],
      },
    });
    defineModule(id, (ctx) => {
      ctx.registerNodeExecutor('k', { execute: () => Promise.resolve({}) });
      ctx.registerAuthProvider('a', {
        apply: () => Promise.resolve({ headers: {}, query: {}, cookies: {} }),
      });
    });
    await activate(id, manifest);
    expect(nodes.resolve(pluginNodeKind(id, 'k'))).toBeDefined();
    expect(auth.resolve(pluginAuthType(id, 'a'))).toBeDefined();

    await manager.deactivate(id);
    expect(nodes.resolve(pluginNodeKind(id, 'k'))).toBeUndefined();
    expect(auth.resolve(pluginAuthType(id, 'a'))).toBeUndefined();
    expect(changes).toContain('deactivated');
  });

  it('routes plugin.log events into the injected log function', async () => {
    const id = 'com.acme.talky';
    const manifest = makeManifest(id);
    defineModule(id, (ctx) => {
      ctx.log.info('hello from activate', { n: 1 });
      ctx.log.error('something bad');
    });
    await activate(id, manifest);
    await flush();

    expect(brokerLog).toHaveBeenCalledWith(
      'info',
      `[${id}] hello from activate`,
      expect.objectContaining({ pluginId: id, data: { n: 1 } }),
    );
    expect(brokerLog).toHaveBeenCalledWith(
      'error',
      `[${id}] something bad`,
      expect.objectContaining({ pluginId: id }),
    );
  });

  it('a host that never becomes ready is discarded, and the next spawn recovers', async () => {
    const id = 'com.acme.late';
    const manifest = makeManifest(id);
    defineModule(id, () => undefined);

    vi.useFakeTimers();
    try {
      deadSpawn = true;
      const failing = activate(id, manifest).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(5_100);
      const error = await failing;
      expect((error as Error).message).toMatch(/did not become ready/);
      expect(manager.statusOf(id)).toMatchObject({ status: 'error' });
    } finally {
      vi.useRealTimers();
    }

    // A working host spawned afterwards must not be shadowed by the dead endpoint.
    deadSpawn = false;
    await activate(id, manifest);
    expect(manager.statusOf(id)).toEqual({ status: 'active' });
    expect(transports).toHaveLength(1);
  });
});
