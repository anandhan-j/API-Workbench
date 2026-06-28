import type {
  AuthArtifacts,
  AuthConfig,
  ApplyContext,
  CredentialMeta,
  SaveCredentialInput,
} from '@shared/auth';
import { AuthConfig as AuthConfigSchema } from '@shared/auth';
import type { PersistenceService } from '../persistence';
import { PersistenceError } from '../persistence/types';
import type { AuthConfigRow } from '../persistence/schema';
import type { Encryptor } from '../variables/encryptor';
import { applyAuth } from './applier';
import { refreshOAuth2, isOAuth2Expired, type TokenFetcher } from './token-manager';

function rowToMeta(row: AuthConfigRow): CredentialMeta {
  return {
    id: row.id,
    scope: row.scope,
    scopeId: row.scopeId,
    name: row.name,
    type: row.type as CredentialMeta['type'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Recursively substitutes variables in every string field of a config. */
function substitute(config: AuthConfig, evaluate: (template: string) => string): AuthConfig {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return evaluate(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(config) as AuthConfig;
}

/**
 * Authentication framework service (Phase 9).
 *
 * Stores reusable named credentials with secret material encrypted at rest
 * (via the same {@link Encryptor} abstraction as the variable engine), resolves
 * variables inside a config at apply time, refreshes OAuth2 tokens, and produces
 * the concrete HTTP artifacts the execution engine applies. Credentials are
 * scoped (e.g. workspace/collection), so the same auth is reusable across many
 * requests and environments.
 */
export class AuthService {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly encryptor: Encryptor,
  ) {}

  save(input: SaveCredentialInput): CredentialMeta {
    const json = JSON.stringify(input.config);
    const useEncryption = this.encryptor.isAvailable();
    const stored = useEncryption ? this.encryptor.encrypt(json) : json;
    const row = this.persistence.authConfigs.save({
      scope: input.scope,
      scopeId: input.scopeId ?? '',
      name: input.name,
      type: input.config.type,
      config: stored,
      encrypted: useEncryption,
    });
    return rowToMeta(row);
  }

  list(scope: string, scopeId = ''): CredentialMeta[] {
    return this.persistence.authConfigs.listByScope(scope, scopeId).map(rowToMeta);
  }

  /** Returns the decrypted, parsed config. Internal / apply use only. */
  getConfig(id: string): AuthConfig {
    const row = this.persistence.authConfigs.get(id);
    if (!row) throw new PersistenceError(`Credential not found: ${id}`);
    const json = row.encrypted ? this.encryptor.decrypt(row.config) : row.config;
    return AuthConfigSchema.parse(JSON.parse(json));
  }

  delete(id: string): void {
    this.persistence.authConfigs.delete(id);
  }

  /** Applies a config directly (already resolved). */
  applyConfig(config: AuthConfig, ctx: ApplyContext): AuthArtifacts {
    return applyAuth(config, ctx);
  }

  /** Applies a stored credential, substituting variables via `evaluate`. */
  apply(
    id: string,
    ctx: ApplyContext,
    evaluate: (template: string) => string = (t) => t,
  ): AuthArtifacts {
    const config = substitute(this.getConfig(id), evaluate);
    return applyAuth(config, ctx);
  }

  /** Refreshes a stored OAuth2 credential's access token and persists it. */
  async refresh(id: string, fetcher: TokenFetcher, now = Date.now()): Promise<CredentialMeta> {
    const config = this.getConfig(id);
    if (config.type !== 'oauth2') {
      throw new PersistenceError(`Credential ${id} is not an OAuth2 credential`);
    }
    const next = await refreshOAuth2(config, fetcher, now);
    const row = this.persistence.authConfigs.get(id);
    if (!row) throw new PersistenceError(`Credential not found: ${id}`);
    return this.save({ scope: row.scope, scopeId: row.scopeId, name: row.name, config: next });
  }

  /** Whether a stored OAuth2 credential needs a refresh. */
  needsRefresh(id: string, now = Date.now()): boolean {
    const config = this.getConfig(id);
    return config.type === 'oauth2' && isOAuth2Expired(config, now);
  }
}
