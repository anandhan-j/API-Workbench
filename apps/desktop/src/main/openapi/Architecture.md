# OpenAPI Import — Architecture

This module is a small pipeline with four clearly separated stages, each independently testable, composed by a thin service. The separation matters because the inputs are messy (two spec versions, two serialization formats, hand-written documents) and the output must land cleanly in the collection structure.

## Pipeline

```
load → parse → detect version → validate → normalize → generate
```

**Load** resolves the spec text from its source: inline text, or a remote URL via an injectable `fetchText`. Injecting the fetcher keeps URL imports testable without the network and keeps the network call out of the pure stages.

**Parse** (`parser.ts`) turns text into an object. It tries JSON first and falls back to YAML, recording which format won, and rejects anything that is not a JSON/YAML object. This is also where version detection (`openapi: 3.x` vs `swagger: 2.0`) and minimal structural validation (`info`, `paths`) live, each raising a typed `OpenApiImportError` with a human-readable message.

**Normalize** (`normalizer.ts`) is the heart of the module: it reduces either spec dialect to one internal model — a base URL, the ordered set of tags, and a flat list of operations (method, path, absolute URL, display name, tag) — plus schema and example counts. Handling the two dialects' differences (servers vs host/basePath/schemes, components/schemas vs definitions) is contained entirely here, so nothing downstream needs to know which dialect it came from.

**Generate** (`generator.ts`) walks the normalized operations and creates the collection, one folder per tag, and one request per operation through the `CollectionExplorer`, all inside a single transaction. Using the explorer (rather than raw SQL) means imported requests obey the same validation and ordering rules as hand-created ones, and the transaction makes the import atomic and fast on large specs.

## Why a normalized middle model

Parsing and generating are coupled to different things — the former to spec syntax, the latter to the collection schema. Inserting a normalized model between them decouples those concerns: a future spec dialect (or a different import source, like Postman) only needs a new normalizer targeting the same model, and the generator is untouched. It also gives the tests a clean seam — they assert on the normalized operations and on the generated tree independently.

## Robustness and scale

The normalizer is defensive: every nested access is guarded, so a malformed path item or operation is skipped rather than crashing the import. Example counting is a bounded recursive walk over the paths object. The generator's single-transaction strategy is what lets a 1,000-operation spec import in a fraction of a second in the test suite. The whole module imports no Electron API and is verified against sql.js, including that large-spec import.
