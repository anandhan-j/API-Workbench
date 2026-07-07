// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { NodeEncryptor } from '../../variables/node-encryptor';
import { AiProviderStore } from '../ai-provider-store';

async function makeStore(): Promise<AiProviderStore> {
  const connection = await createSqlJsConnection();
  const persistence = new PersistenceService(connection, { backupDir: '/tmp/awb-test-ai' });
  return new AiProviderStore(persistence, new NodeEncryptor());
}

describe('AiProviderStore', () => {
  let store: AiProviderStore;
  beforeEach(async () => {
    store = await makeStore();
  });

  it('stores a provider with the key encrypted and never exposes it', () => {
    const saved = store.save({
      kind: 'anthropic',
      label: 'Claude',
      defaultModel: 'claude-opus-4-8',
      apiKey: 'sk-secret-123',
    });

    // The DTO reports presence, not the key.
    expect(saved).not.toHaveProperty('apiKey');
    expect(saved.hasKey).toBe(true);
    expect(store.list()).toHaveLength(1);

    // The decrypted key is recoverable only through the main-process accessor.
    const { apiKey } = store.getWithKey(saved.id);
    expect(apiKey).toBe('sk-secret-123');
  });

  it('preserves the stored key when metadata is re-saved without a key', () => {
    const saved = store.save({
      kind: 'openai-compat',
      label: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
      apiKey: 'sk-deepseek',
    });

    const updated = store.save({
      id: saved.id,
      kind: 'openai-compat',
      label: 'DeepSeek (prod)',
      baseUrl: 'https://api.deepseek.com',
      defaultModel: 'deepseek-reasoner',
      // no apiKey: metadata-only update
    });

    expect(updated.label).toBe('DeepSeek (prod)');
    expect(updated.defaultModel).toBe('deepseek-reasoner');
    expect(updated.hasKey).toBe(true);
    expect(store.getWithKey(saved.id).apiKey).toBe('sk-deepseek');
  });

  it('replaces the key when a new one is provided', () => {
    const saved = store.save({
      kind: 'anthropic',
      label: 'Claude',
      defaultModel: 'claude-opus-4-8',
      apiKey: 'sk-old',
    });
    store.save({
      id: saved.id,
      kind: 'anthropic',
      label: 'Claude',
      defaultModel: 'claude-opus-4-8',
      apiKey: 'sk-new',
    });
    expect(store.getWithKey(saved.id).apiKey).toBe('sk-new');
  });

  it('stores a gateway URL and custom headers for an Anthropic provider', () => {
    const saved = store.save({
      kind: 'anthropic',
      label: 'Claude via Aerolink',
      baseUrl: 'https://aerolink.internal/anthropic',
      defaultModel: 'claude-opus-4-8',
      headers: { Authorization: 'Bearer gateway-token', 'x-aerolink-route': 'prod' },
      apiKey: 'sk-key',
    });

    expect(saved.baseUrl).toBe('https://aerolink.internal/anthropic');
    expect(saved.headers).toEqual({
      Authorization: 'Bearer gateway-token',
      'x-aerolink-route': 'prod',
    });

    // getWithKey surfaces the headers alongside the decrypted key for the adapter.
    const resolved = store.getWithKey(saved.id);
    expect(resolved.config.headers).toEqual(saved.headers);
    expect(resolved.apiKey).toBe('sk-key');
  });

  it('defaults headers to an empty object when none are set', () => {
    const saved = store.save({
      kind: 'anthropic',
      label: 'Claude',
      defaultModel: 'claude-opus-4-8',
      apiKey: 'sk',
    });
    expect(saved.headers).toEqual({});
  });

  it('deletes a provider', () => {
    const saved = store.save({
      kind: 'anthropic',
      label: 'Claude',
      defaultModel: 'claude-opus-4-8',
      apiKey: 'sk',
    });
    store.delete(saved.id);
    expect(store.list()).toHaveLength(0);
  });
});
