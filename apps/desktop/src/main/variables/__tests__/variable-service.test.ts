// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { variables as variablesTable } from '../../persistence/schema';
import { VariableService } from '../variable-service';
import { NodeEncryptor } from '../node-encryptor';
import type { Encryptor } from '../encryptor';

/** An encryptor that reports unavailable, so secrets fall back to plaintext. */
const unavailableEncryptor: Encryptor = {
  isAvailable: () => false,
  encrypt: (p) => p,
  decrypt: (c) => c,
};

describe('VariableService', () => {
  let dir: string;
  let service: PersistenceService;
  let variables: VariableService;

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-var-'));
    service = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    variables = new VariableService(service, new NodeEncryptor(), {
      now: () => 1700,
      uuid: () => 'fixed-uuid',
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // --- CRUD ---

  it('sets and lists a non-secret variable with its plaintext value', () => {
    variables.set({ scope: 'global', key: 'base', value: 'https://api.example.com' });
    const list = variables.list('global');
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe('base');
    expect(list[0].value).toBe('https://api.example.com');
    expect(list[0].secret).toBe(false);
    expect(list[0].scopeId).toBe('');
  });

  it('upserts (replaces) a variable with the same key in the same scope', () => {
    variables.set({ scope: 'workspace', scopeId: 'ws1', key: 'k', value: 'a' });
    variables.set({ scope: 'workspace', scopeId: 'ws1', key: 'k', value: 'b' });
    const list = variables.list('workspace', 'ws1');
    expect(list).toHaveLength(1);
    expect(list[0].value).toBe('b');
  });

  it('requires a scopeId for non-global scopes', () => {
    expect(() => variables.set({ scope: 'workspace', key: 'k', value: 'v' })).toThrow();
  });

  it('deletes a variable', () => {
    variables.set({ scope: 'global', key: 'k', value: 'v' });
    variables.delete('global', 'k');
    expect(variables.list('global')).toHaveLength(0);
  });

  // --- Secret handling (acceptance) ---

  it('stores a secret encrypted and never returns plaintext to the renderer', () => {
    variables.set({ scope: 'global', key: 'token', value: 'super-secret', secret: true });

    // Raw stored value is encrypted (not the plaintext).
    const raw = service.db.select().from(variablesTable).all();
    expect(raw).toHaveLength(1);
    expect(raw[0].encrypted).toBe(true);
    expect(raw[0].value).not.toBe('super-secret');

    // Renderer-facing DTO masks: no `value`, but flags secret + hasValue.
    const masked = variables.list('global')[0];
    expect(masked.secret).toBe(true);
    expect(masked.encrypted).toBe(true);
    expect(masked.hasValue).toBe(true);
    expect(masked.value).toBeUndefined();
  });

  it('decrypts secret values during resolution', () => {
    variables.set({ scope: 'global', key: 'token', value: 'super-secret', secret: true });
    const resolved = variables.resolve({});
    expect(resolved.get('token')?.value).toBe('super-secret');
    expect(resolved.get('token')?.secret).toBe(true);
  });

  it('falls back to plaintext storage when no encryptor is available, still masking', () => {
    const noCrypt = new VariableService(service, unavailableEncryptor);
    noCrypt.set({ scope: 'global', key: 'token', value: 'plain-secret', secret: true });
    const raw = service.db.select().from(variablesTable).all()[0];
    expect(raw.encrypted).toBe(false);
    expect(raw.value).toBe('plain-secret'); // not encrypted (unavailable)
    // Still masked toward the renderer.
    expect(noCrypt.list('global')[0].value).toBeUndefined();
    // And still resolvable.
    expect(noCrypt.resolve({}).get('token')?.value).toBe('plain-secret');
  });

  // --- Precedence (acceptance) ---

  it('resolves by precedence with higher scopes overriding lower ones', () => {
    variables.set({ scope: 'global', key: 'host', value: 'global' });
    variables.set({ scope: 'workspace', scopeId: 'ws1', key: 'host', value: 'workspace' });
    variables.set({ scope: 'collection', scopeId: 'c1', key: 'host', value: 'collection' });
    variables.set({ scope: 'folder', scopeId: 'f1', key: 'host', value: 'folder' });
    variables.set({ scope: 'request', scopeId: 'r1', key: 'host', value: 'request' });
    variables.set({ scope: 'workflow', scopeId: 'wf1', key: 'host', value: 'workflow' });

    const ctx = {
      workspaceId: 'ws1',
      collectionId: 'c1',
      folderId: 'f1',
      requestId: 'r1',
      workflowId: 'wf1',
    };
    expect(variables.resolve(ctx).get('host')?.value).toBe('workflow');

    // Drop workflow + request → folder wins.
    expect(
      variables.resolve({ workspaceId: 'ws1', collectionId: 'c1', folderId: 'f1' }).get('host')
        ?.value,
    ).toBe('folder');
  });

  it('lets runtime variables override every persisted scope', () => {
    variables.set({ scope: 'global', key: 'host', value: 'global' });
    variables.set({ scope: 'workflow', scopeId: 'wf1', key: 'host', value: 'workflow' });
    const resolved = variables.resolve({ workflowId: 'wf1', runtime: { host: 'runtime' } });
    expect(resolved.get('host')?.value).toBe('runtime');
  });

  it('ignores scopes absent from the context', () => {
    variables.set({ scope: 'global', key: 'host', value: 'global' });
    variables.set({ scope: 'workspace', scopeId: 'ws1', key: 'host', value: 'workspace' });
    // No workspaceId in context → workspace scope skipped, global wins.
    expect(variables.resolve({}).get('host')?.value).toBe('global');
  });

  // --- Evaluate (acceptance) ---

  it('substitutes {{ key }} from the resolved precedence map', () => {
    variables.set({ scope: 'global', key: 'host', value: 'api.example.com' });
    variables.set({ scope: 'workspace', scopeId: 'ws1', key: 'host', value: 'staging.example.com' });
    const out = variables.evaluate({
      template: 'https://{{host}}/v1',
      context: { workspaceId: 'ws1' },
    });
    expect(out).toBe('https://staging.example.com/v1');
  });

  it('uses the default after | when the key is unresolved or empty', () => {
    expect(variables.evaluate({ template: '{{missing | fallback}}' })).toBe('fallback');
    variables.set({ scope: 'global', key: 'present', value: 'X' });
    expect(variables.evaluate({ template: '{{ present | fb }}' })).toBe('X');
  });

  it('replaces unknown tokens with an empty string when no default is given', () => {
    expect(variables.evaluate({ template: 'a{{nope}}b' })).toBe('ab');
  });

  it('supports dynamic built-ins (deterministic when injected)', () => {
    expect(variables.evaluate({ template: '{{$timestamp}}' })).toBe('1700');
    expect(variables.evaluate({ template: '{{$randomUUID}}' })).toBe('fixed-uuid');
  });

  it('exposes resolved keys with secret flags but no plaintext', () => {
    variables.set({ scope: 'global', key: 'open', value: 'v' });
    variables.set({ scope: 'global', key: 'secret', value: 's', secret: true });
    const keys = variables.resolvedKeys({});
    const byKey = new Map(keys.map((k) => [k.key, k]));
    expect(byKey.get('open')?.secret).toBe(false);
    expect(byKey.get('secret')?.secret).toBe(true);
    // ResolvedKey carries no value field at all.
    expect((byKey.get('secret') as Record<string, unknown>).value).toBeUndefined();
  });
});
