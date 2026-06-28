import type { ImportRequest, ImportResult } from '@shared/openapi';
import type { PersistenceService } from '../persistence';
import { parseDocument, detectVersion, validateBasic } from './parser';
import { normalizeSpec } from './normalizer';
import { generateCollection, checksumContent } from './generator';
import { loadSpecContent, type FetchText } from './load';

export interface ImportServiceDeps {
  /** Injectable fetcher so remote-URL imports are testable without the network. */
  fetchText?: FetchText;
}

/**
 * Orchestrates an OpenAPI/Swagger import: load → parse → detect version →
 * validate → normalize → generate. Returns a summary of what was created.
 */
export class ImportService {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly deps: ImportServiceDeps = {},
  ) {}

  async import(request: ImportRequest): Promise<ImportResult> {
    const content = await loadSpecContent(request.source, this.deps.fetchText);
    const { document, format } = parseDocument(content);
    const version = detectVersion(document);
    validateBasic(document);
    const spec = normalizeSpec(document, version);

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
      specVersion: version,
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
