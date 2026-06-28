# OpenAPI Import Module

The OpenAPI/Swagger import engine (Phase 5). It parses OpenAPI 3.x and Swagger 2.0 documents in JSON or YAML — from pasted text or a remote URL — and generates a collection of folders and requests into the Phase 4 structure.

See [Architecture.md](./Architecture.md) and [Phase 5](../../../../../docs/PHASE_5.md).

## Public API

- `ImportService` — the orchestrator. Construct it with a `CollectionExplorer`, a `PersistenceService`, and optional deps (`fetchText` for URL imports). `import(request)` returns an `ImportResult`.
- `parseDocument(content)` — parse JSON, falling back to YAML; returns the document and format.
- `detectVersion(document)` — `openapi-3` or `swagger-2`.
- `validateBasic(document)` — ensures `info` and `paths` exist.
- `normalizeSpec(document, version)` — reduces a spec to `{ baseUrl, tags, operations, schemaCount, exampleCount }`.
- `generateCollection(explorer, persistence, spec, target)` — creates the collection, folders, and requests.
- `OpenApiImportError` — thrown for malformed, unsupported, or incomplete documents.

## Usage

```ts
const importer = new ImportService(collectionExplorer, persistence);

const result = await importer.import({
  projectId,
  name: 'Petstore',               // optional; defaults to the spec title
  source: { type: 'text', content: specJsonOrYaml },
});
// result: { collectionId, requestsCreated, foldersCreated, specVersion, format, schemaCount, ... }

// remote URL
await importer.import({ projectId, source: { type: 'url', url: 'https://api.example.com/openapi.json' } });
```

## Behaviour

The base URL comes from the first OpenAPI 3 `server`, or from `scheme://host + basePath` for Swagger 2. Operations are grouped into one folder per first tag (untagged operations go to the collection root). Each request is named from the operation `summary`, then `operationId`, then `METHOD path`. Generation runs in a single transaction, so a failed import creates nothing. Request bodies, headers, and auth are not persisted yet — those arrive with the execution engine (Phase 10); this phase builds the request tree and reports schema/example counts.
