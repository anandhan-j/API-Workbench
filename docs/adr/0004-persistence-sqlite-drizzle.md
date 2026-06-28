# ADR-0004: SQLite + Drizzle for local persistence

- **Status:** Accepted
- **Date:** 2026-06-27
- **Related:** ADR-0001

## Context

API Workbench is local-first: projects, collections, requests, history, version snapshots, preferences, and encrypted secrets must persist on the user's machine with no mandatory cloud. The data is relational (collections contain folders contain requests; versions reference collections; variables belong to scopes) and must support transactions, automatic and safe schema migrations with zero data loss, and responsiveness at 100,000+ requests. The persistence layer must stay behind the repository ports declared by the application layer so business logic never depends on the database directly.

## Decision

We will use **SQLite** as the embedded datastore and **Drizzle ORM** as the typed query builder and migration system. SQLite runs in the main process only; the renderer reaches data through IPC, never directly. Drizzle schemas define tables in TypeScript, migrations are generated and versioned in the repository, and they are applied automatically and transactionally on app startup with rollback on failure. All data access is implemented as repository adapters fulfilling application-layer ports, so the domain and use cases remain database-agnostic.

## Alternatives considered

A **document store / raw JSON files** was rejected because the data is relational and needs transactional integrity, querying, and indexing that a file blob cannot provide at scale. **better-sqlite3 with hand-written SQL** was rejected because it sacrifices the typed schema and the structured, versioned migration workflow that the zero-data-loss acceptance criteria demand. **Prisma** was considered but rejected for this Electron context due to its heavier engine/runtime footprint and packaging friction; Drizzle is lighter, TypeScript-first, and integrates cleanly. **An embedded server database (e.g. Postgres)** was rejected as far too heavy and operationally inappropriate for a local desktop app.

## Consequences

We get a transactional, queryable, typed local store with a disciplined migration path, satisfying the no-data-loss and automatic-migration acceptance criteria. Keeping SQLite in the main process and behind ports preserves the security boundary (ADR-0003) and the clean-architecture dependency direction (ADR-0001). The cost is that all data access is asynchronous from the renderer's perspective (mediated by IPC) and that we own the migration and backup/restore machinery, which Phase 2 delivers explicitly.
