import { parse as parseYaml } from 'yaml';
import type { SpecFormat, SpecVersion } from '@shared/openapi';

/** Raised when a document cannot be parsed or is not a recognised API spec. */
export class OpenApiImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenApiImportError';
  }
}

export interface ParsedDocument {
  document: Record<string, unknown>;
  format: SpecFormat;
}

/**
 * Parses raw spec text as JSON, falling back to YAML. Returns the parsed object
 * and which format succeeded. Throws {@link OpenApiImportError} if neither works
 * or the result is not an object.
 */
export function parseDocument(content: string): ParsedDocument {
  const trimmed = content.trim();
  if (!trimmed) throw new OpenApiImportError('The document is empty');

  let document: unknown;
  let format: SpecFormat;
  try {
    document = JSON.parse(trimmed);
    format = 'json';
  } catch {
    try {
      document = parseYaml(trimmed);
      format = 'yaml';
    } catch (error) {
      throw new OpenApiImportError(
        `Document is neither valid JSON nor YAML: ${(error as Error).message}`,
      );
    }
  }

  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    throw new OpenApiImportError('The document is not a valid OpenAPI/Swagger object');
  }
  return { document: document as Record<string, unknown>, format };
}

/** Determines whether the document is OpenAPI 3.x or Swagger 2.0. */
export function detectVersion(document: Record<string, unknown>): SpecVersion {
  const openapi = document['openapi'];
  if (typeof openapi === 'string' && openapi.startsWith('3')) return 'openapi-3';

  const swagger = document['swagger'];
  if (typeof swagger === 'string' && swagger.startsWith('2')) return 'swagger-2';

  throw new OpenApiImportError(
    'Unsupported specification: expected an "openapi: 3.x" or "swagger: 2.0" field',
  );
}

/** Validates the minimum structure required to generate a collection. */
export function validateBasic(document: Record<string, unknown>): void {
  const info = document['info'];
  if (typeof info !== 'object' || info === null) {
    throw new OpenApiImportError('Specification is missing the required "info" object');
  }
  const paths = document['paths'];
  if (typeof paths !== 'object' || paths === null) {
    throw new OpenApiImportError('Specification is missing the required "paths" object');
  }
}
