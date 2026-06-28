# ADR-0001: Modular monorepo with clean-architecture layers

- **Status:** Accepted
- **Date:** 2026-06-27
- **Related:** ADR-0003, ADR-0007

## Context

API Workbench is a single product composed of many cohesive features — collections, OpenAPI import and sync, variables, auth, execution, testing, workflows, versioning — plus a desktop shell and a plugin SDK. These features share a domain model and must evolve together, yet they need to be developed, tested, and reasoned about independently. The codebase must stay free of circular dependencies and must keep framework- and platform-specific concerns (Electron, SQLite, HTTP) from leaking into business logic. The team also needs fast, cacheable builds and a single source of truth for shared types, particularly the IPC contract crossing the Electron process boundary.

## Decision

We will structure the project as a modular monorepo (pnpm workspaces + Turborepo) organised around clean-architecture layers. Code is split into `apps/` (runnable units) and `packages/` (reusable libraries), with `domain`, `application`, `infrastructure`, `shared`, and feature-module packages. Dependencies point inward only — `domain` depends on nothing; `application` depends on `domain` and `shared`; `infrastructure` implements ports declared by `application`; the UI consumes `application` through the IPC contract. The acyclic dependency rule is enforced in CI via lint rules and TypeScript project references.

## Alternatives considered

A **polyrepo** (one repository per feature) was rejected because the features share a fast-moving domain model and an IPC contract; coordinating cross-cutting changes across many repos would dominate the team's time and invite version skew. A **single flat package** was rejected because it provides no enforced boundaries: business logic and Electron/SQLite code would intermix, circular dependencies would creep in, and the >90% coverage and security goals would be far harder to meet. A **monorepo without layered packages** (feature folders only) was rejected because it would not enforce the inward dependency direction that keeps the domain pure and testable.

## Consequences

Boundaries are explicit and machine-enforced, which keeps the domain framework-free and independently testable and makes the architecture legible to new contributors. Turborepo caching keeps CI fast by rebuilding only what changed. The cost is upfront tooling complexity (workspace config, project references, shared tooling packages) and the discipline of routing all cross-module use through public package entry points rather than reaching into internals. This decision is the foundation that ADR-0003 (process boundary) and ADR-0007 (plugin boundary) build upon.
