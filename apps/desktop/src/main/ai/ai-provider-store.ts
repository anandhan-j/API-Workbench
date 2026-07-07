import type { AiProviderConfig, SaveAiProviderInput } from '@shared/ai';
import type { PersistenceService } from '../persistence';
import type { AiProviderRow } from '../persistence/schema';
import type { Encryptor } from '../variables/encryptor';

/** A provider config paired with its decrypted API key, for main-process use only. */
export interface ProviderWithKey {
  config: AiProviderConfig;
  apiKey: string | null;
}

function toDto(row: AiProviderRow): AiProviderConfig {
  return {
    id: row.id,
    kind: row.kind as AiProviderConfig['kind'],
    label: row.label,
    baseUrl: row.baseUrl ?? null,
    defaultModel: row.defaultModel,
    headers: row.headers ?? {},
    hasKey: Boolean(row.apiKey),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Stores AI provider configs with the API key encrypted at rest (ADR-0012),
 * behind the same {@link Encryptor} port as the auth credential store and the
 * variable engine. The plaintext key never leaves the main process — the
 * renderer-facing {@link AiProviderConfig} exposes only `hasKey`.
 */
export class AiProviderStore {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly encryptor: Encryptor,
  ) {}

  list(): AiProviderConfig[] {
    return this.persistence.aiProviders.list().map(toDto);
  }

  save(input: SaveAiProviderInput): AiProviderConfig {
    const key = input.apiKey?.trim() ? input.apiKey : undefined;
    const useEncryption = key !== undefined && this.encryptor.isAvailable();
    const stored = key === undefined ? null : useEncryption ? this.encryptor.encrypt(key) : key;

    const headers = input.headers && Object.keys(input.headers).length > 0 ? input.headers : null;
    const row = {
      kind: input.kind,
      label: input.label,
      baseUrl: input.baseUrl ?? null,
      defaultModel: input.defaultModel,
      headers,
      apiKey: stored,
      encrypted: useEncryption,
    };

    const result = input.id
      ? this.persistence.aiProviders.update(input.id, row)
      : this.persistence.aiProviders.create(row);
    return toDto(result);
  }

  delete(id: string): void {
    this.persistence.aiProviders.delete(id);
  }

  /** Resolves a provider and decrypts its key. Throws if the provider is unknown. */
  getWithKey(id: string): ProviderWithKey {
    const row = this.persistence.aiProviders.get(id);
    if (!row) throw new Error(`AI provider not found: ${id}`);
    const apiKey =
      row.apiKey == null ? null : row.encrypted ? this.encryptor.decrypt(row.apiKey) : row.apiKey;
    return { config: toDto(row), apiKey };
  }
}
