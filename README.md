# API Workbench

A modern, Electron-based desktop application for API testing and visual workflow automation. API Workbench imports OpenAPI specifications, keeps collections in sync as specs evolve, executes REST requests, manages environments and secrets, and lets developers compose drag-and-drop API workflows that run deterministically. It is designed to replace Postman for individual developers while adding substantially more powerful workflow automation.

> **Status:** Architecture & design phase. This repository currently contains the architecture documentation that governs implementation. Code is delivered phase-by-phase per the [roadmap](docs/ROADMAP.md).

## Why API Workbench

Most API clients stop at sending requests and inspecting responses. API Workbench treats an API collection as living, versioned data that stays synchronized with its OpenAPI source, and treats multi-step API interactions as first-class, visual, executable workflows. Everything runs locally — projects, history, secrets, and versions are stored on the user's machine in SQLite — so there is no mandatory cloud dependency.

## Core capabilities

The platform is built around a small set of capabilities that compound:

- **OpenAPI import & synchronization** — import OpenAPI 3.x and Swagger 2 (JSON/YAML, local or remote), then re-sync when the spec changes without losing manual edits.
- **Request execution** — full REST execution with streaming, multipart, uploads/downloads, retries, timeouts, redirects, cancellation, and a rich response viewer.
- **Variables & environments** — layered variable scopes (global → workspace → collection → folder → request → workflow → runtime) with encrypted secrets and a deterministic resolver.
- **Authentication** — Bearer, OAuth2, Basic, Digest, API Key, Cookies, AWS SigV4, and client certificates, reusable across requests and environments.
- **Visual workflows** — a React Flow canvas for composing workflows with sequential/parallel execution, conditions, loops, retries, and data mapping (JSONPath/JMESPath/regex/expressions).
- **Versioning** — snapshot, diff, and roll back collection versions with OpenAPI checksums.
- **Extensibility** — a plugin SDK for custom nodes, request types, auth providers, and importers without modifying the core.

## Technology stack

Electron + React + TypeScript + Vite on the desktop; TailwindCSS, shadcn/ui, Radix, Lucide, and Framer Motion for UI; Zustand and React Query for state; React Router for routing; React Hook Form + Zod for forms; Monaco for editing; React Flow for the workflow canvas; SQLite with Drizzle ORM for persistence. Testing uses Vitest, React Testing Library, and Playwright. See [Tech Stack](docs/architecture/TECH_STACK.md) for the full rationale.

## Architecture at a glance

API Workbench is a **modular monorepo** with feature-based modules and a strict dependency direction. The UI, Application, Domain, Infrastructure, and Shared layers are separated into distinct packages; communication crossing the Electron process boundary goes through a validated, typed IPC contract. See the [Architecture Overview](docs/architecture/ARCHITECTURE.md) and the [Architecture Decision Records](docs/adr/).

## Documentation map

| Document | Purpose |
| --- | --- |
| [Architecture Overview](docs/architecture/ARCHITECTURE.md) | Layers, process model, data flow, cross-cutting concerns |
| [Folder Structure](docs/architecture/FOLDER_STRUCTURE.md) | Monorepo layout and conventions |
| [Tech Stack](docs/architecture/TECH_STACK.md) | Chosen technologies and why |
| [Diagrams](docs/architecture/DIAGRAMS.md) | C4 context/container/component + sequence diagrams |
| [Roadmap](docs/ROADMAP.md) | The 20 delivery phases, deliverables, and acceptance criteria |
| [ADR Index](docs/adr/README.md) | Architecture Decision Records |

## Repository conventions

Source lives under `apps/` (runnable applications) and `packages/` (shared libraries and feature modules). Every module ships its own `README.md` and `Architecture.md`. Decisions are recorded as ADRs. No phase is considered complete until its acceptance criteria, tests (>90% coverage), documentation, and CI all pass — see the Definition of Done in the [Roadmap](docs/ROADMAP.md).

## Getting started (for contributors)

A `Getting Started` guide with install/build/run instructions is delivered alongside the Phase 1 application shell. Until then, this documentation set defines the target architecture that Phase 1 implements.
