import {
  LogEventPayload,
  StorageDeleteParams,
  StorageGetParams,
  StorageSetParams,
  VariablesResolveParams,
  VariablesSetParams,
} from '@shared/plugin-rpc';
import { RpcCallError } from '@shared/plugin-rpc-endpoint';
import type { PersistenceService } from '../persistence';

/** Storage quotas per plugin: 1 MB per value, 200 keys. */
const MAX_VALUE_BYTES = 1024 * 1024;
const MAX_KEYS = 200;

export interface CapabilityBrokerDeps {
  persistence: PersistenceService;
  /** Resolves `{{variables}}` (global scope; plugins carry no request context). */
  evaluate?: (template: string) => string;
  setVariable?: (scope: 'workspace' | 'global', key: string, value: string) => void;
  log?: (level: 'info' | 'warn' | 'error', message: string, context?: object) => void;
}

/**
 * Serves host→main capability calls (Phase 16, ADR-0007/0010). This is the
 * security gate: every call re-reads the plugin's persisted grants — the host
 * process's own checks are UX, not enforcement. Unknown methods and ungranted
 * capabilities are rejected; storage is quota-enforced.
 */
export class CapabilityBroker {
  constructor(private readonly deps: CapabilityBrokerDeps) {}

  /** Handles one capability RPC from the host. */
  async handle(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'cap.storage.get': {
        const p = StorageGetParams.parse(params);
        this.assertInstalled(p.pluginId);
        return { value: this.deps.persistence.pluginStorage.get(p.pluginId, p.key) };
      }
      case 'cap.storage.set': {
        const p = StorageSetParams.parse(params);
        this.assertInstalled(p.pluginId);
        if (Buffer.byteLength(p.value, 'utf8') > MAX_VALUE_BYTES) {
          throw new RpcCallError('E_STORAGE_QUOTA', 'Value exceeds the 1 MB limit');
        }
        const storage = this.deps.persistence.pluginStorage;
        if (storage.get(p.pluginId, p.key) === undefined && storage.countKeys(p.pluginId) >= MAX_KEYS) {
          throw new RpcCallError('E_STORAGE_QUOTA', `A plugin may store at most ${MAX_KEYS} keys`);
        }
        storage.set(p.pluginId, p.key, p.value);
        return {};
      }
      case 'cap.storage.delete': {
        const p = StorageDeleteParams.parse(params);
        this.assertInstalled(p.pluginId);
        this.deps.persistence.pluginStorage.delete(p.pluginId, p.key);
        return {};
      }
      case 'cap.variables.resolve': {
        const p = VariablesResolveParams.parse(params);
        this.assertGranted(p.pluginId, 'variables:read');
        if (!this.deps.evaluate) {
          throw new RpcCallError('E_UNAVAILABLE', 'Variable resolution is not available');
        }
        return { value: this.deps.evaluate(p.template) };
      }
      case 'cap.variables.set': {
        const p = VariablesSetParams.parse(params);
        this.assertGranted(p.pluginId, 'variables:write');
        if (!this.deps.setVariable) {
          throw new RpcCallError('E_UNAVAILABLE', 'Variable writes are not available');
        }
        this.deps.setVariable(p.scope, p.key, p.value);
        return {};
      }
      default:
        throw new RpcCallError('E_UNKNOWN_CAPABILITY', `Unknown capability method: ${method}`);
    }
  }

  /** Routes a `plugin.log` event from the host into the structured logger. */
  handleLogEvent(payload: unknown): void {
    const parsed = LogEventPayload.safeParse(payload);
    if (!parsed.success) return;
    this.deps.log?.(parsed.data.level, `[${parsed.data.pluginId}] ${parsed.data.message}`, {
      pluginId: parsed.data.pluginId,
      ...(parsed.data.data !== undefined ? { data: parsed.data.data } : {}),
    });
  }

  private assertInstalled(pluginId: string): void {
    if (!this.deps.persistence.plugins.get(pluginId)) {
      throw new RpcCallError('E_PLUGIN_UNKNOWN', `Plugin not installed: ${pluginId}`);
    }
  }

  private assertGranted(pluginId: string, capability: string): void {
    const row = this.deps.persistence.plugins.get(pluginId);
    if (!row) throw new RpcCallError('E_PLUGIN_UNKNOWN', `Plugin not installed: ${pluginId}`);
    if (!row.grantedCapabilities.includes(capability)) {
      throw new RpcCallError('E_CAPABILITY_DENIED', `Capability not granted: ${capability}`);
    }
  }
}
