import type { SpecVersion } from '@shared/openapi';
import type {
  ImporterParseResult,
  RegisteredImporter,
} from '../plugins/registries/importer-registry';
import { parseDocument, detectVersion, validateBasic } from './parser';
import { normalizeSpec } from './normalizer';

/**
 * The built-in OpenAPI/Swagger importers as registry entries (Phase 16).
 *
 * Both entries share one version-agnostic pipeline (parse → detect → validate →
 * normalize); `detect` is what tells them apart during auto-detection. Keeping
 * `parse` version-agnostic means the auto-detect fallback path (default
 * importer) reproduces the exact legacy diagnostics for malformed content.
 */

function sniffVersion(content: string): SpecVersion | null {
  try {
    return detectVersion(parseDocument(content).document);
  } catch {
    return null;
  }
}

function parseOpenApi(content: string): ImporterParseResult {
  const { document, format } = parseDocument(content);
  const version = detectVersion(document);
  validateBasic(document);
  return { spec: normalizeSpec(document, version), format };
}

export function builtinOpenApiImporters(): RegisteredImporter[] {
  return (['openapi-3', 'swagger-2'] as const).map((id) => ({
    id,
    detect: (content: string) => sniffVersion(content) === id,
    parse: parseOpenApi,
  }));
}

/** The importer used when auto-detection finds no positive match. */
export const DEFAULT_IMPORTER_ID = 'openapi-3';
