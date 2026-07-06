// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ApplyContext, AuthArtifacts } from '@shared/auth';
import { BUILTIN_NODE_EXECUTORS } from '../../workflows/node-executors';
import { NodeExecutorRegistry, pluginNodeKind } from '../registries/node-executor-registry';
import {
  AuthProviderRegistry,
  isBuiltinAuthType,
  pluginAuthType,
} from '../registries/auth-provider-registry';
import { ImporterRegistry, pluginImporterId } from '../registries/importer-registry';
import { builtinOpenApiImporters, DEFAULT_IMPORTER_ID } from '../../openapi/openapi-importer';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { NodeEncryptor } from '../../variables/node-encryptor';
import { AuthService } from '../../auth/auth-service';

const OPENAPI_JSON = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/a': { get: { responses: { '200': { description: 'ok' } } } } },
});
const SWAGGER_JSON = JSON.stringify({
  swagger: '2.0',
  info: { title: 'S', version: '1' },
  paths: { '/b': { get: { responses: { '200': { description: 'ok' } } } } },
});

describe('NodeExecutorRegistry', () => {
  const registry = (): NodeExecutorRegistry => new NodeExecutorRegistry(BUILTIN_NODE_EXECUTORS);

  it('resolves every built-in kind', () => {
    const r = registry();
    for (const kind of [
      'start',
      'request',
      'set-variable',
      'delay',
      'sub-workflow',
      'condition',
      'switch',
      'loop',
      'transform',
      'user-input',
      'end',
    ]) {
      expect(r.isBuiltin(kind)).toBe(true);
      expect(r.resolve(kind)).toBeTypeOf('function');
    }
  });

  it('returns undefined for unknown kinds', () => {
    const r = registry();
    expect(r.isBuiltin('plugin:com.acme.x/y')).toBe(false);
    expect(r.resolve('plugin:com.acme.x/y')).toBeUndefined();
  });

  it('registers, resolves, and unregisters plugin executors', () => {
    const r = registry();
    const exec = (): never => {
      throw new Error('unused');
    };
    r.registerPlugin('com.acme.x', 'uuid', exec);
    const kind = pluginNodeKind('com.acme.x', 'uuid');
    expect(kind).toBe('plugin:com.acme.x/uuid');
    expect(r.resolve(kind)).toBe(exec);
    expect(r.dynamicKinds()).toEqual([kind]);
    expect(() => r.registerPlugin('com.acme.x', 'uuid', exec)).toThrow(/already registered/);

    r.registerPlugin('com.other.y', 'uuid', exec);
    r.unregisterPlugin('com.acme.x');
    expect(r.resolve(kind)).toBeUndefined();
    expect(r.dynamicKinds()).toEqual([pluginNodeKind('com.other.y', 'uuid')]);
  });
});

describe('AuthProviderRegistry', () => {
  it('distinguishes built-in from plugin auth types', () => {
    expect(isBuiltinAuthType('bearer')).toBe(true);
    expect(isBuiltinAuthType('awsSigv4')).toBe(true);
    expect(isBuiltinAuthType('plugin:com.acme.x/hmac')).toBe(false);
  });

  it('registers, resolves, and unregisters plugin providers', async () => {
    const r = new AuthProviderRegistry();
    const apply = async (): Promise<AuthArtifacts> => ({
      headers: {},
      query: {},
      cookies: {},
    });
    r.registerPlugin('com.acme.x', 'hmac', apply);
    const type = pluginAuthType('com.acme.x', 'hmac');
    expect(r.resolve(type)?.pluginId).toBe('com.acme.x');
    await expect(r.resolve(type)?.apply({}, { method: 'GET', url: 'https://x' })).resolves.toEqual({
      headers: {},
      query: {},
      cookies: {},
    });
    expect(() => r.registerPlugin('com.acme.x', 'hmac', apply)).toThrow(/already registered/);
    expect(r.dynamicTypes()).toEqual([type]);
    r.unregisterPlugin('com.acme.x');
    expect(r.resolve(type)).toBeUndefined();
  });
});

describe('ImporterRegistry', () => {
  const make = (): ImporterRegistry =>
    new ImporterRegistry(builtinOpenApiImporters(), DEFAULT_IMPORTER_ID);

  it('rejects a default id that is not a built-in', () => {
    expect(() => new ImporterRegistry(builtinOpenApiImporters(), 'nope')).toThrow(
      /not among the built-ins/,
    );
  });

  it('resolves an explicit importer id and rejects unknown ids', async () => {
    const r = make();
    expect((await r.resolve('swagger-2', OPENAPI_JSON)).id).toBe('swagger-2');
    await expect(r.resolve('plugin:x/y', OPENAPI_JSON)).rejects.toThrow(/Unknown importer/);
  });

  it('auto-detects the spec version', async () => {
    const r = make();
    expect((await r.resolve(undefined, OPENAPI_JSON)).id).toBe('openapi-3');
    expect((await r.resolve(undefined, SWAGGER_JSON)).id).toBe('swagger-2');
  });

  it('falls back to the default importer so legacy diagnostics surface', async () => {
    const r = make();
    const importer = await r.resolve(undefined, 'not: [valid');
    expect(importer.id).toBe(DEFAULT_IMPORTER_ID);
    await expect(async () => importer.parse('{}')).rejects.toThrow(/Unsupported specification/);
  });

  it('registers and unregisters plugin importers', async () => {
    const r = make();
    r.registerPlugin('com.acme.csv', 'csv', {
      detect: (content) => content.startsWith('name,'),
      parse: () => {
        throw new Error('unused');
      },
    });
    const id = pluginImporterId('com.acme.csv', 'csv');
    expect((await r.resolve(undefined, 'name,url\n')).id).toBe(id);
    expect(r.ids()).toContain(id);
    expect(() =>
      r.registerPlugin('com.acme.csv', 'csv', { detect: () => false, parse: () => ({}) as never }),
    ).toThrow(/already registered/);
    r.unregisterPlugin('com.acme.csv');
    expect(r.ids()).not.toContain(id);
    expect((await r.resolve(undefined, 'name,url\n')).id).toBe(DEFAULT_IMPORTER_ID);
  });

  it('built-in importers parse both versions through one pipeline', async () => {
    const openapi = await builtinOpenApiImporters()[0]!.parse(OPENAPI_JSON);
    expect(openapi.spec.specVersion).toBe('openapi-3');
    expect(openapi.format).toBe('json');
    const swagger = await builtinOpenApiImporters()[1]!.parse(SWAGGER_JSON);
    expect(swagger.spec.specVersion).toBe('swagger-2');
    expect(swagger.spec.operations).toHaveLength(1);
  });
});

describe('AuthService.resolveRequestAuth / resolveArtifacts', () => {
  let dir: string;
  let persistence: PersistenceService;
  let auth: AuthService;
  let providers: AuthProviderRegistry;

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-plugins-'));
    persistence = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    providers = new AuthProviderRegistry();
    auth = new AuthService(persistence, new NodeEncryptor(), providers);
  });

  afterEach(() => {
    persistence.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const ctx: ApplyContext = { method: 'GET', url: 'https://api.example.com/x' };

  it('attaches a stored credential only when no inline auth is present', () => {
    const meta = auth.save({
      scope: 'workspace',
      name: 'cred',
      config: { type: 'bearer', token: 'stored' },
    });
    const attached = auth.resolveRequestAuth({ credentialId: meta.id });
    expect(attached.auth).toEqual({ type: 'bearer', token: 'stored' });

    const inline = auth.resolveRequestAuth({
      credentialId: meta.id,
      auth: { type: 'bearer', token: 'inline' },
    });
    expect(inline.auth).toEqual({ type: 'bearer', token: 'inline' });

    const untouched = auth.resolveRequestAuth({});
    expect(untouched.auth).toBeUndefined();
  });

  it('resolves artifacts from inline config, stored credential, or nothing', async () => {
    const empty = await auth.resolveArtifacts({}, ctx);
    expect(empty).toEqual({ headers: {}, query: {}, cookies: {} });

    const inline = await auth.resolveArtifacts(
      { auth: { type: 'bearer', token: '{{tok}}' } },
      ctx,
      (t) => t.replace('{{tok}}', 'abc'),
    );
    expect(inline.headers['Authorization']).toBe('Bearer abc');

    const meta = auth.save({
      scope: 'workspace',
      name: 'cred',
      config: { type: 'bearer', token: 'stored' },
    });
    const stored = await auth.resolveArtifacts({ credentialId: meta.id }, ctx);
    expect(stored.headers['Authorization']).toBe('Bearer stored');
  });

  it('dispatches non-built-in types through the provider registry', async () => {
    providers.registerPlugin('com.acme.x', 'hmac', async (config, applyCtx) => ({
      headers: { 'X-Sig': `${config['secret']}@${applyCtx.url}` },
      query: {},
      cookies: {},
    }));
    const artifacts = await auth.resolveArtifacts(
      {
        auth: {
          type: 'plugin:com.acme.x/hmac',
          secret: 's3',
        } as never,
      },
      ctx,
    );
    expect(artifacts.headers['X-Sig']).toBe('s3@https://api.example.com/x');

    await expect(
      auth.resolveArtifacts({ auth: { type: 'plugin:com.acme.x/missing' } as never }, ctx),
    ).rejects.toThrow(/Unknown auth provider/);
  });
});
