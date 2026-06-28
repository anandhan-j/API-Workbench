# Phase 5 — OpenAPI Import Engine

This document records what the Phase 5 milestone delivers, the decisions taken, and its acceptance status. Phase 5 lets developers turn an OpenAPI/Swagger document into a ready-to-use collection.

## Delivered

An import engine under `apps/desktop/src/main/openapi`, exposed over IPC and surfaced in the renderer.

The engine accepts OpenAPI 3.x and Swagger 2.0 documents in JSON or YAML, from pasted text or a remote URL. It parses (JSON with YAML fallback), detects the spec version, validates the minimum structure, normalizes either dialect into a single internal model (base URL, tags, operations, schema/example counts), and generates a collection with one folder per tag and one request per operation — all in a single transaction. Malformed, unsupported, or incomplete documents are rejected with a typed, readable error.

It is wired to the renderer through a new `openapi.import` IPC channel and composed in the bootstrap. On the renderer, an Import panel on the Collections screen lets the user paste a spec or give a URL, optionally name the collection, and see a summary of what was imported; the collection list refreshes automatically.

## Key decisions

**A normalized middle model.** Parsing and generating are decoupled by a normalized representation, so the two spec dialects are reconciled in one place and the generator never sees dialect differences. A future importer (another dialect, or Postman) only needs a new normalizer.

**Generate through the explorer, in one transaction.** Imported requests are created via the `CollectionExplorer`, so they obey the same validation and ordering as hand-created ones, and the single transaction makes large imports atomic and fast.

**Injectable URL fetcher.** Remote-URL imports take their fetcher as a dependency, keeping the network out of the pure pipeline and making URL imports testable offline.

**Tree first, bodies later.** This phase builds the request tree (method, URL, name) and reports schema/example counts. Persisting request bodies, headers, and auth belongs to the execution phase (Phase 10), so it is intentionally deferred.

## Tests and verification

Six tests cover the engine: importing an OpenAPI 3 JSON document (folders by tag, base URL from servers, schema and example counts, generated request URLs), importing a Swagger 2 document (base URL from host/basePath/schemes, definitions count), importing YAML, fetching from a URL via the injected fetcher, rejecting malformed/unsupported/incomplete documents, and a **large-spec import of 1,000 operations** that completes in a fraction of a second. Three React Testing Library tests cover the Import panel (text and URL submission, and the result summary). Together with the prior phases the suite is **74 tests across 16 files, all passing**, and the renderer/shared and service TypeScript projects type-check cleanly.

As before, the headless sandbox verifies typecheck and tests but cannot launch Electron or compile the native driver; the live application runs on a developer workstation per [Getting Started](./guides/GETTING_STARTED.md).

## Acceptance criteria

Phase 5 requires importing large enterprise specifications. The engine is verified against a 1,000-operation spec that imports atomically and quickly into the collection structure, and it handles both OpenAPI 3.x and Swagger 2.0 in JSON and YAML, from text or URL, with validation and clear errors. The required pieces — parser, validation, collection/folder/operation generators, and schema/example accounting — are all present.

## Next

Phase 6 (OpenAPI Synchronization Engine) will diff a changed spec against an existing collection and merge updates while preserving manual edits. See the [Roadmap](./ROADMAP.md).
