import { AuthType, type ApplyContext, type AuthArtifacts } from '@shared/auth';

/**
 * Runtime registry for authentication providers (Phase 16, ADR-0007).
 *
 * Built-in auth types stay in the pure, synchronous `applyAuth` switch
 * (main/auth/applier.ts); this registry holds plugin-contributed providers
 * keyed by fully-qualified type (`plugin:<pluginId>/<type>`). Plugin providers
 * are async by contract — they are dispatched over RPC to the plugin host.
 */

export interface DynamicAuthProvider {
  pluginId: string;
  apply(config: Record<string, unknown>, ctx: ApplyContext): Promise<AuthArtifacts>;
}

const BUILTIN_TYPES = new Set<string>(AuthType.options);

/** Fully-qualified plugin auth type: `plugin:<pluginId>/<type>`. */
export function pluginAuthType(pluginId: string, type: string): string {
  return `plugin:${pluginId}/${type}`;
}

export function isBuiltinAuthType(type: string): boolean {
  return BUILTIN_TYPES.has(type);
}

export class AuthProviderRegistry {
  private readonly dynamic = new Map<string, DynamicAuthProvider>();

  resolve(type: string): DynamicAuthProvider | undefined {
    return this.dynamic.get(type);
  }

  registerPlugin(pluginId: string, type: string, apply: DynamicAuthProvider['apply']): void {
    const qualified = pluginAuthType(pluginId, type);
    if (this.dynamic.has(qualified)) {
      throw new Error(`Auth provider "${qualified}" is already registered`);
    }
    this.dynamic.set(qualified, { pluginId, apply });
  }

  /** Removes every provider a plugin registered (uninstall/disable). */
  unregisterPlugin(pluginId: string): void {
    for (const [type, entry] of this.dynamic) {
      if (entry.pluginId === pluginId) this.dynamic.delete(type);
    }
  }

  dynamicTypes(): string[] {
    return [...this.dynamic.keys()];
  }
}
