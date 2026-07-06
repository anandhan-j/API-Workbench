# Diagrams

This document collects the system's structural and behavioural diagrams, authored in Mermaid so they render in most Markdown viewers and stay versioned alongside the code. They follow the C4 model (context → container → component) and add sequence and flow diagrams for the most important runtime behaviours. Diagrams here describe the target architecture defined in the [Architecture Overview](./ARCHITECTURE.md).

## C4 Level 1 — System context

Who and what API Workbench interacts with.

```mermaid
flowchart TB
  dev(["Developer<br/>(user)"])
  app["API Workbench<br/>Electron desktop app"]
  specs[("OpenAPI / Swagger specs<br/>local files or remote URLs")]
  apis(("Target REST APIs<br/>under test"))
  os[["OS services<br/>keychain, file system"]]
  plugins{{"Third-party plugins"}}

  dev -->|imports specs, builds & runs workflows| app
  app -->|fetches & parses| specs
  app -->|executes HTTP requests| apis
  app -->|encrypts secrets, stores data| os
  plugins -->|extend via SDK| app
```

## C4 Level 2 — Containers

The runtime pieces inside the application and how they communicate. The renderer is sandboxed; everything privileged lives in the main process.

```mermaid
flowchart TB
  subgraph Desktop["API Workbench (Electron)"]
    direction TB
    subgraph R["Renderer process (sandboxed)"]
      ui["React UI<br/>Zustand + React Query"]
    end
    subgraph P["Preload"]
      bridge["contextBridge<br/>allowlisted IPC"]
    end
    subgraph M["Main process (privileged)"]
      appl["Application layer<br/>use cases + ports"]
      infra["Infrastructure<br/>repos · HTTP client · parser · crypto"]
      workers["Workers<br/>(utility processes / threads)"]
    end
    db[("SQLite<br/>(Drizzle)")]
  end
  apis(("Target REST APIs"))

  ui <-->|typed, validated IPC| bridge
  bridge <--> appl
  appl --> infra
  appl --> workers
  infra --> db
  infra -->|HTTP| apis
```

## C4 Level 3 — Components (main process)

The application and infrastructure layers decomposed into the feature modules from the [Folder Structure](./FOLDER_STRUCTURE.md).

```mermaid
flowchart LR
  subgraph App["Application layer (use cases + ports)"]
    col["Collections"]
    oa["OpenAPI import/sync"]
    var["Variables"]
    auth["Auth"]
    exec["Execution"]
    test["Testing"]
    wf["Workflows"]
    ver["Versioning"]
  end
  subgraph Infra["Infrastructure (port implementations)"]
    repo["Drizzle repositories"]
    http["HTTP execution client"]
    parser["OpenAPI parser"]
    crypto["safeStorage crypto"]
    bus["Domain event bus"]
  end
  domain["Domain layer<br/>entities · value objects · events"]

  col --> domain
  oa --> domain
  var --> domain
  auth --> domain
  exec --> domain
  test --> domain
  wf --> domain
  ver --> domain

  col --> repo
  oa --> parser
  oa --> repo
  var --> crypto
  auth --> crypto
  exec --> http
  ver --> repo
  oa -->|"collection imported"| bus
  bus -->|"auto snapshot"| ver
```

## Sequence — Execute a request

How a send flows from the editor through the boundary to an external API and back, with variables resolved and secrets handled only in the main process.

```mermaid
sequenceDiagram
  actor User
  participant UI as Renderer (React)
  participant Bridge as Preload bridge
  participant App as Application (main)
  participant Var as Variable engine
  participant Auth as Auth framework
  participant HTTP as HTTP client
  participant API as Target API
  participant DB as SQLite (history)

  User->>UI: Click Send
  UI->>Bridge: invoke "request.execute" (payload)
  Bridge->>App: validated IPC message
  App->>Var: resolve variables (scope precedence)
  Var-->>App: resolved request (secrets decrypted in-memory)
  App->>Auth: apply authentication
  Auth-->>App: authorized request
  App->>HTTP: dispatch (timeout, retry, redirects)
  HTTP->>API: HTTP request
  API-->>HTTP: response (may stream)
  HTTP-->>App: response + timing metrics
  App->>DB: persist to history
  App-->>Bridge: response (secrets redacted)
  Bridge-->>UI: result
  UI-->>User: render in response viewer
```

## Sequence — Import then synchronize an OpenAPI spec

How import generates a collection and how a later sync preserves manual edits.

```mermaid
sequenceDiagram
  participant UI as Renderer
  participant App as Application (main)
  participant Parser as OpenAPI parser
  participant Gen as Collection generator
  participant Diff as Diff/merge engine
  participant DB as SQLite
  participant Ver as Versioning

  UI->>App: import(spec source)
  App->>Parser: parse & validate (3.x / Swagger 2)
  Parser-->>App: normalized spec model
  App->>Gen: generate collection/folders/operations
  Gen-->>App: collection
  App->>DB: persist collection (+ checksum)
  App->>Ver: snapshot v1

  Note over UI,Ver: later — spec changes
  UI->>App: synchronize(updated spec)
  App->>Parser: parse & validate
  App->>Diff: diff(new spec vs current collection)
  Diff-->>App: changes (added/removed/modified, conflicts)
  App->>App: safe merge — preserve manual edits & metadata
  App->>DB: apply merged result (+ new checksum)
  App->>Ver: snapshot v2 (change summary)
```

## State — Workflow runtime

The execution states a workflow run moves through, supporting pause, resume, retry, and cancellation.

```mermaid
stateDiagram-v2
  [*] --> Pending
  Pending --> Running: start
  Running --> Paused: pause
  Paused --> Running: resume
  Running --> Retrying: node failed (retry policy)
  Retrying --> Running: retry
  Running --> Failed: error (no retry left)
  Running --> Cancelled: cancel
  Paused --> Cancelled: cancel
  Running --> Completed: all nodes done
  Failed --> [*]
  Cancelled --> [*]
  Completed --> [*]
```

## Sequence — Plugin contribution execution (Phase 16)

How a plugin-contributed request type executes: the envelope dispatches through the registry to an RPC-backed provider running in the isolated plugin host (ADR-0009/0010). Node executors, auth providers, and importers follow the same shape.

```mermaid
sequenceDiagram
  participant R as Renderer
  participant IPC as IPC layer (Zod)
  participant EX as ExecutionService
  participant REG as RequestTypeRegistry
  participant HM as PluginHostManager (RPC)
  participant PH as Plugin host (utility process)
  participant P as Plugin code

  R->>IPC: request.execute { RequestEnvelope, type: plugin:id/t }
  IPC->>EX: run(envelope)
  EX->>REG: resolve('plugin:id/t')
  REG-->>EX: provider (validates payload vs FormSchema, substitutes vars)
  EX->>HM: provider.execute(payload, artifacts, signal)
  HM->>PH: req request.execute (correlation id, timeout)
  PH->>P: provider.execute({payload, artifacts, options, signal})
  P-->>PH: ProtocolResult
  PH-->>HM: res (Zod-validated in main)
  HM-->>EX: ProtocolResponse
  EX-->>IPC: ProtocolResponse (response schema validated)
  IPC-->>R: rendered by the generic response viewer
  Note over PH,P: Capability calls (storage/variables/fetch) flow<br/>back over the same wire via the CapabilityBroker,<br/>which re-checks persisted grants per call
```

## Maintaining these diagrams

When a structural change is made, update the affected diagram in the same change set, and if the change reflects a decision, record it as an [ADR](../adr/). Module-specific diagrams live in that module's `Architecture.md`; this file holds system-wide views.
