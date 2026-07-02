# Folder Structure

API Workbench is a **modular monorepo** managed with pnpm workspaces and Turborepo. Runnable applications live under `apps/`; everything reusable lives under `packages/`. The split between the two is deliberate: `apps/` packages are deployable units that wire things together and own no reusable logic, while `packages/` packages are independently versioned, testable libraries with a single clear responsibility.

The dependency rule from the [Architecture Overview](./ARCHITECTURE.md) is reflected directly in the package graph: `domain` depends on nothing, `application` depends on `domain` and `shared`, `infrastructure` depends on `application`, `domain`, and `shared`, and the UI app depends on `application` (via the IPC contract) and `shared`. CI enforces that this graph stays acyclic.

## Top-level layout

```
api-workbench/
├── apps/
│   ├── desktop/                # Electron app: main, preload, renderer entry, packaging
│   └── docs-site/              # (optional) static docs site build
├── packages/
│   ├── plugin-sdk/             # @api-workbench/plugin-sdk — public plugin contract (Phase 16)
│   ├── domain/                 # Entities, value objects, domain events, invariants
│   ├── application/            # Use cases, services, ports (interfaces), DI tokens
│   ├── infrastructure/         # Port implementations: db, http, parser, crypto, fs
│   ├── shared/                 # Cross-cutting types, IPC contract, utils, constants
│   ├── ui-kit/                 # Design system: shadcn/ui + Radix wrappers, theming
│   └── features/               # Feature-based modules (see below)
│       ├── collections/
│       ├── openapi/
│       ├── variables/
│       ├── auth/
│       ├── execution/
│       ├── testing/
│       ├── workflows/
│       └── versioning/
├── plugins/
│   └── examples/               # One example plugin per extension point (test fixtures + docs)
├── docs/                       # Architecture docs, ADRs, guides (this folder)
├── tooling/
│   ├── eslint-config/          # Shared ESLint config
│   ├── tsconfig/               # Shared base tsconfigs
│   └── vitest-config/          # Shared test config
├── .github/workflows/          # CI pipelines
├── package.json                # Workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

## The desktop app

`apps/desktop` is the only package that knows it is an Electron application. It is internally split along the process boundary so that privileged and unprivileged code never accidentally share a module.

```
apps/desktop/
├── src/
│   ├── main/                   # Main process (privileged)
│   │   ├── bootstrap/          # App lifecycle, window creation, DI composition root
│   │   ├── ipc/                # Channel handlers; validates payloads, calls use cases
│   │   ├── workers/            # Utility-process / worker-thread entry points
│   │   └── index.ts
│   ├── preload/                # contextBridge: exposes allowlisted IPC channels only
│   │   └── index.ts
│   ├── plugin-host/            # Plugin host utility-process bundle (unprivileged; ADR-0010)
│   │   └── index.ts
│   └── renderer/               # Renderer process (sandboxed React app)
│       ├── app/                # Router, providers (React Query, theme), error boundary
│       ├── pages/              # Route-level screens
│       ├── widgets/            # Composite UI: sidebar, tabs, status bar, panels
│       ├── shared/             # Renderer-only hooks, ipc client wrappers
│       └── main.tsx
├── electron-builder.yml        # Packaging / code signing / auto-update config
├── vite.config.ts              # Vite for renderer; electron-vite orchestration
└── package.json
```

## Anatomy of a feature module

Every package under `packages/features/` follows the same internal shape so that a contributor can move between features without relearning the layout. A feature owns its slice of all three inner layers but exposes only a public surface through its `index.ts`. It never imports another feature's internals.

```
packages/features/collections/
├── src/
│   ├── domain/                 # Collection, Folder, Request entities + invariants
│   ├── application/            # Use cases (createCollection, moveRequest, …) + ports
│   ├── infrastructure/         # Drizzle repository impls, mappers
│   ├── ui/                     # React components, hooks, stores for this feature
│   ├── index.ts                # Public API of the module — the only allowed import path
│   └── ipc.ts                  # Channel definitions this feature contributes
├── README.md                   # What this module is and how to use it
├── Architecture.md             # Module-level design, diagrams, decisions
├── __tests__/                  # Unit + integration tests colocated with the module
└── package.json
```

The `domain`, `application`, and `infrastructure` segments inside a feature mirror the global layers and obey the same dependency direction locally. The `ui` segment depends on the feature's own application use cases through the IPC client, consistent with the process boundary.

## Documentation convention

Per the project standard, every module ships a `README.md` (purpose, public API, usage) and an `Architecture.md` (internal design, diagrams, decisions). Cross-module and system-wide decisions are recorded as [ADRs](../adr/) rather than buried in module docs. Diagrams are authored in Mermaid and live either inline in the relevant doc or in [DIAGRAMS.md](./DIAGRAMS.md).

## Tooling and configuration

Shared configuration is centralised under `tooling/` and extended by each package, so lint rules, TypeScript settings, and test setup are defined once. Turborepo orchestrates `build`, `lint`, `test`, and `typecheck` across the graph with caching, so CI only rebuilds what changed. Path aliases map package names to their `src/` entry, and project references in `tsconfig` make incremental TypeScript builds fast and enforce the dependency boundaries at compile time.

## Naming conventions

Packages are named `@api-workbench/<name>`. Files use kebab-case; React components use PascalCase filenames matching the component; types and interfaces are PascalCase; functions and variables are camelCase; constants are SCREAMING_SNAKE_CASE. Test files sit next to the code they test under `__tests__/` or as `*.test.ts(x)`. IPC channel names follow a `domain.action` dotted convention (for example `collection.create`, `request.execute`, `workflow.run`).
