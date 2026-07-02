# Architecture Decision Records

An Architecture Decision Record (ADR) captures a single significant architectural decision: the context that forced a choice, the decision made, the alternatives weighed, and the consequences accepted. ADRs are immutable once accepted — a decision that changes is superseded by a new ADR rather than edited, so the history of *why* the system is shaped the way it is stays intact.

Use the [template](./0000-template.md) for new records. Number them sequentially and link related records.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0000](./0000-template.md) | ADR template | Meta |
| [0001](./0001-modular-monorepo.md) | Modular monorepo with clean-architecture layers | Accepted |
| [0002](./0002-state-management-split.md) | Split state: Zustand for UI, React Query for server state | Accepted |
| [0003](./0003-electron-security-and-ipc.md) | Electron security model and typed IPC contract | Accepted |
| [0004](./0004-persistence-sqlite-drizzle.md) | SQLite + Drizzle for local persistence | Accepted |
| [0005](./0005-workflow-engine-design.md) | Separate workflow domain model from the React Flow canvas | Accepted |
| [0006](./0006-secret-and-credential-storage.md) | Secret and credential storage via OS-backed encryption | Accepted |
| [0007](./0007-plugin-sdk-boundary.md) | Plugin SDK as a versioned, capability-constrained contract | Accepted |
| [0008](./0008-workflow-execution-context.md) | Workflow execution context as a propagated runtime variable map | Accepted |
| [0009](./0009-protocol-abstraction.md) | Protocol-agnostic request execution | Accepted |
| [0010](./0010-plugin-host-process.md) | Plugin host as a shared utility process with a brokered RPC bridge | Accepted |

## Conventions

A record's **Status** is one of Proposed, Accepted, Superseded (by ADR-NNNN), or Deprecated. The filename is `NNNN-kebab-case-title.md`. Keep each record focused on one decision; if a discussion spawns a second decision, write a second ADR and cross-link them.
