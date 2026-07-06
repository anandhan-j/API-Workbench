import type { ImportRequest, ImportResult } from '@shared/openapi';
import type { PersistenceService } from '../persistence';
import { ImporterRegistry } from '../plugins/registries/importer-registry';
import { builtinOpenApiImporters, DEFAULT_IMPORTER_ID } from './openapi-importer';
import { generateCollection, checksumContent } from './generator';
import { loadSpecContent, type FetchText } from './load';

export interface ImportServiceDeps {
  /** Injectable fetcher so remote-URL imports are testable without the network. */
  fetchText?: FetchText;
  /** Importer registry; defaults to the built-in OpenAPI/Swagger importers. */
  importers?: ImporterRegistry;
}

/**
 * Orchestrates a collection import: load → resolve importer → parse to the
 * shared normalized contract → generate. Returns a summary of what was created.
 * Importers are resolved through the {@link ImporterRegistry} (Phase 16), so
 * plugin-contributed formats flow through the same pipeline as the built-ins.
 */
export class ImportService {
  private readonly importers: ImporterRegistry;

  constructor(
    private readonly persistence: PersistenceService,
    private readonly deps: ImportServiceDeps = {},
  ) {
    this.importers =
      deps.importers ?? new ImporterRegistry(builtinOpenApiImporters(), DEFAULT_IMPORTER_ID);
  }

  async import(request: ImportRequest): Promise<ImportResult> {
    const content = await loadSpecContent(request.source, this.deps.fetchText);
    const importer = await this.importers.resolve(request.importerId, content);
    const { spec, format } = await importer.parse(content);

    const generated = generateCollection(
      this.persistence,
      spec,
      { projectId: request.projectId, ...(request.name ? { name: request.name } : {}) },
      checksumContent(content),
      request.source.type === 'url' ? request.source.url : null,
    );

    return {
      collectionId: generated.collectionId,
      collectionName: generated.collectionName,
      specVersion: spec.specVersion,
      format,
      title: spec.title,
      apiVersion: spec.apiVersion,
      baseUrl: spec.baseUrl,
      foldersCreated: generated.foldersCreated,
      requestsCreated: generated.requestsCreated,
      operationCount: spec.operations.length,
      schemaCount: spec.schemaCount,
      exampleCount: spec.exampleCount,
    };
  }
}
