import type {
  EvaluateRequest,
  ResolvedKey,
  ResolvedVariable,
  SetVariableInput,
  Variable,
  VariableContext,
  VariableScope,
} from '@shared/variable';
import type { PersistenceService } from '../persistence/persistence-service';
import { PersistenceError } from '../persistence/types';
import type { VariableRow } from '../persistence/schema';
import type { Encryptor } from './encryptor';

/**
 * Placeholder substituted for a secret's value when masking for the renderer.
 * The plaintext (or ciphertext) never crosses the IPC boundary.
 */
export const SECRET_MASK = '••••••••';

/**
 * Scopes ordered by ascending precedence. A variable defined at a higher-index
 * scope overrides the same key at a lower one. `runtime` (highest) is supplied
 * directly in the context, not from the database.
 */
const SCOPE_PRECEDENCE: VariableScope[] = [
  'global',
  'workspace',
  'collection',
  'folder',
  'request',
  'workflow',
  'runtime',
];

/** Matches {{ key }} or {{ key | default }} (whitespace tolerant). */
const TOKEN_RE = /\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export interface VariableServiceOptions {
  /** Injectable clock for deterministic `{{$timestamp}}` in tests. */
  now?: () => number;
  /** Injectable uuid for deterministic `{{$randomUUID}}` in tests. */
  uuid?: () => string;
}

/**
 * The variable engine (Phase 8).
 *
 * Owns scoped variable CRUD (with secret encryption), resolves a variable set
 * for a given context by precedence, and evaluates `{{ key }}` templates against
 * that resolved set.
 *
 * Acceptance features:
 *  - **Precedence**: `resolve(context)` merges global → workspace → collection →
 *    folder → request → workflow → runtime, higher scopes winning; runtime
 *    (a plain map) always wins; scopes absent from the context are ignored.
 *  - **Secret handling**: secrets are stored encrypted when an encryptor is
 *    available, decrypted only inside the main process during resolution, and
 *    masked (never plaintext) in the renderer-facing `list`/`get` DTOs.
 */
export class VariableService {
  private readonly now: () => number;
  private readonly uuid: () => string;

  constructor(
    private readonly persistence: PersistenceService,
    private readonly encryptor: Encryptor,
    options: VariableServiceOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.uuid = options.uuid ?? (() => globalThis.crypto?.randomUUID?.() ?? fallbackUuid());
  }

  // --- CRUD ---

  /**
   * Creates or updates a variable. Secret values are encrypted when the
   * encryptor is available; if not, they are stored as plaintext but still
   * flagged secret so they are masked toward the renderer.
   */
  set(input: SetVariableInput): Variable {
    const scopeId = normalizeScopeId(input.scope, input.scopeId);
    // On a value-only overwrite (no explicit `secret`, e.g. a set-variable node or
    // hover edit), keep the existing variable's secret flag so updating a secret's
    // value never silently turns it into stored plaintext.
    const existing = this.persistence.variables.get(input.scope, scopeId, input.key);
    const secret = input.secret ?? existing?.secret ?? false;
    let value = input.value;
    let encrypted = false;
    if (secret && this.encryptor.isAvailable()) {
      value = this.encryptor.encrypt(input.value);
      encrypted = true;
    }
    const row = this.persistence.variables.upsert({
      scope: input.scope,
      scopeId,
      key: input.key,
      value,
      secret,
      encrypted,
    });
    return this.mask(row);
  }

  /** Lists variables for a scope, masking secret values for the renderer. */
  list(scope: VariableScope, scopeId?: string): Variable[] {
    const id = normalizeScopeId(scope, scopeId);
    return this.persistence.variables.listByScope(scope, id).map((row) => this.mask(row));
  }

  /** Gets a single variable (masked). */
  get(scope: VariableScope, key: string, scopeId?: string): Variable | undefined {
    const id = normalizeScopeId(scope, scopeId);
    const row = this.persistence.variables.get(scope, id, key);
    return row ? this.mask(row) : undefined;
  }

  delete(scope: VariableScope, key: string, scopeId?: string): void {
    const id = normalizeScopeId(scope, scopeId);
    this.persistence.variables.deleteOne(scope, id, key);
  }

  // --- Resolution (acceptance feature) ---

  /**
   * Merges every scope present in the context into a single map keyed by
   * variable name, honouring precedence (later scopes override earlier ones).
   * Secret values are decrypted here, inside the main process. Runtime values
   * from `context.runtime` are applied last and therefore always win.
   */
  resolve(context: VariableContext = {}): Map<string, ResolvedVariable> {
    const resolved = new Map<string, ResolvedVariable>();
    for (const scope of SCOPE_PRECEDENCE) {
      if (scope === 'runtime') continue;
      const scopeId = this.scopeIdFor(scope, context);
      if (scopeId === undefined) continue; // scope not present in context
      for (const row of this.persistence.variables.listByScope(scope, scopeId)) {
        resolved.set(row.key, {
          key: row.key,
          value: this.plaintext(row),
          secret: row.secret,
        });
      }
    }
    // Runtime overrides everything.
    if (context.runtime) {
      for (const [key, value] of Object.entries(context.runtime)) {
        resolved.set(key, { key, value, secret: false });
      }
    }
    return resolved;
  }

  /** Resolved keys with their secret flag and originating scope (no plaintext). */
  resolvedKeys(context: VariableContext = {}): ResolvedKey[] {
    const keys = new Map<string, ResolvedKey>();
    for (const scope of SCOPE_PRECEDENCE) {
      if (scope === 'runtime') continue;
      const scopeId = this.scopeIdFor(scope, context);
      if (scopeId === undefined) continue;
      for (const row of this.persistence.variables.listByScope(scope, scopeId)) {
        keys.set(row.key, { key: row.key, secret: row.secret, scope });
      }
    }
    if (context.runtime) {
      for (const key of Object.keys(context.runtime)) {
        keys.set(key, { key, secret: false, scope: 'runtime' });
      }
    }
    return [...keys.values()];
  }

  // --- Evaluation (acceptance feature) ---

  /**
   * Substitutes `{{ key }}` tokens using the resolved precedence map.
   *
   * Syntax:
   *  - `{{ key }}` — replaced with the resolved value.
   *  - `{{ key | fallback }}` — uses `fallback` when `key` is unresolved/empty.
   *  - `{{$timestamp}}` / `{{$randomUUID}}` — dynamic built-ins.
   *  - Unknown tokens with no default are replaced with an empty string.
   */
  evaluate(request: EvaluateRequest): string {
    const resolved = this.resolve(request.context ?? {});
    return request.template.replace(TOKEN_RE, (_match, rawKey: string, rawDefault?: string) => {
      const key = rawKey.trim();
      const fallback = rawDefault ?? '';
      const builtin = this.builtin(key);
      if (builtin !== undefined) return builtin;
      const found = resolved.get(key);
      if (found && found.value !== '') return found.value;
      return fallback;
    });
  }

  private builtin(key: string): string | undefined {
    switch (key) {
      case '$timestamp':
        return String(this.now());
      case '$randomUUID':
        return this.uuid();
      default:
        return undefined;
    }
  }

  // --- Helpers ---

  /** Decrypts a row's value when encrypted; otherwise returns it verbatim. */
  private plaintext(row: VariableRow): string {
    if (row.encrypted) {
      if (!this.encryptor.isAvailable()) {
        throw new PersistenceError(
          `Cannot decrypt secret variable "${row.key}": encryptor unavailable`,
        );
      }
      return this.encryptor.decrypt(row.value);
    }
    return row.value;
  }

  /** Renderer-facing DTO: secret values are masked, never sent as plaintext. */
  private mask(row: VariableRow): Variable {
    const base = {
      id: row.id,
      scope: row.scope as VariableScope,
      scopeId: row.scopeId,
      key: row.key,
      secret: row.secret,
      encrypted: row.encrypted,
      hasValue: row.value.length > 0,
      updatedAt: row.updatedAt,
    };
    if (row.secret) return base; // value omitted entirely
    return { ...base, value: row.value };
  }

  private scopeIdFor(scope: VariableScope, context: VariableContext): string | undefined {
    switch (scope) {
      case 'global':
        return ''; // always present
      case 'workspace':
        return context.workspaceId;
      case 'collection':
        return context.collectionId;
      case 'folder':
        return context.folderId;
      case 'request':
        return context.requestId;
      case 'workflow':
        return context.workflowId;
      default:
        return undefined;
    }
  }
}

/** Global has no owning entity, so its scopeId is always the empty string. */
function normalizeScopeId(scope: VariableScope, scopeId?: string): string {
  if (scope === 'global') return '';
  const id = scopeId ?? '';
  if (id === '') {
    throw new PersistenceError(`Scope "${scope}" requires a scopeId`);
  }
  return id;
}

function fallbackUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
