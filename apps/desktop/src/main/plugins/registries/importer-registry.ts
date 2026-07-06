import type { NormalizedSpec } from '@shared/openapi';

/**
 * Runtime registry for collection importers (Phase 16, ADR-0007).
 *
 * An importer turns raw text into the shared {@link NormalizedSpec} contract;
 * the existing generator then builds the collection, so importers never touch
 * persistence. Built-ins (openapi-3, swagger-2) are seeded at construction;
 * plugin importers register under `plugin:<pluginId>/<id>`.
 *
 * Resolution: an explicit `importerId` wins; otherwise the first importer whose
 * `detect` accepts the content is used; otherwise the default importer parses
 * the content so its (precise, user-facing) parse errors surface unchanged.
 */

export interface ImporterParseResult {
  spec: NormalizedSpec;
  /** 'json' | 'yaml' for the built-ins; a plugin importer's format label otherwise. */
  format: string;
}

export interface RegisteredImporter {
  id: string;
  /** Cheap sniff: whether this importer recognises the content. Must not throw. */
  detect(content: string): boolean | Promise<boolean>;
  parse(content: string): Promise<ImporterParseResult> | ImporterParseResult;
}

/** Fully-qualified plugin importer id: `plugin:<pluginId>/<id>`. */
export function pluginImporterId(pluginId: string, id: string): string {
  return `plugin:${pluginId}/${id}`;
}

export class ImporterRegistry {
  private readonly entries = new Map<string, RegisteredImporter>();
  private readonly pluginOwner = new Map<string, string>();

  constructor(
    builtins: RegisteredImporter[],
    private readonly defaultId: string,
  ) {
    for (const importer of builtins) this.entries.set(importer.id, importer);
    if (!this.entries.has(defaultId)) {
      throw new Error(`Default importer "${defaultId}" is not among the built-ins`);
    }
  }

  async resolve(importerId: string | undefined, content: string): Promise<RegisteredImporter> {
    if (importerId) {
      const importer = this.entries.get(importerId);
      if (!importer) throw new Error(`Unknown importer: ${importerId}`);
      return importer;
    }
    for (const importer of this.entries.values()) {
      if (await importer.detect(content)) return importer;
    }
    // No positive match: let the default importer parse (and fail) so its
    // detailed diagnostics reach the user unchanged.
    return this.entries.get(this.defaultId) as RegisteredImporter;
  }

  registerPlugin(pluginId: string, id: string, importer: Omit<RegisteredImporter, 'id'>): void {
    const qualified = pluginImporterId(pluginId, id);
    if (this.entries.has(qualified)) {
      throw new Error(`Importer "${qualified}" is already registered`);
    }
    this.entries.set(qualified, { ...importer, id: qualified });
    this.pluginOwner.set(qualified, pluginId);
  }

  /** Removes every importer a plugin registered (uninstall/disable). */
  unregisterPlugin(pluginId: string): void {
    for (const [id, owner] of this.pluginOwner) {
      if (owner === pluginId) {
        this.entries.delete(id);
        this.pluginOwner.delete(id);
      }
    }
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }
}
