# ADR-0002: Split state — Zustand for UI, React Query for server state

- **Status:** Accepted
- **Date:** 2026-06-27
- **Related:** ADR-0003

## Context

The renderer manages two fundamentally different kinds of state. The first is ephemeral view state: which tabs are open, panel sizes, the current selection, in-progress draft edits in the request editor. This state is local to the renderer, changes constantly, and never needs to be authoritative. The second is persisted application state: collections, requests, environments, history, versions — all of which actually live in SQLite in the main process and reach the renderer over IPC. Treating both with one tool leads either to a heavyweight global store that re-implements caching and invalidation by hand, or to scattering async fetch logic without a coherent caching strategy.

## Decision

We will use **Zustand** for ephemeral renderer-local UI state and **React Query** for all state that originates in the main process. React Query owns caching, background refetching, request de-duplication, and invalidation for IPC-backed data; mutations go through IPC and invalidate the relevant query keys. Zustand holds only what the user is currently doing in the view. The main process and SQLite remain the single source of truth; the renderer never holds an authoritative copy of persisted data.

## Alternatives considered

**Redux Toolkit for everything** was rejected as too much boilerplate for transient UI state and as a poor fit for server-cache concerns that React Query handles natively. **React Query alone** (no Zustand) was rejected because purely local view state does not belong in a server-cache abstraction and would be awkward to model as queries. **Zustand alone** was rejected because it would force us to hand-roll caching, staleness, and refetching that React Query provides correctly out of the box. **React Context for server state** was rejected for the well-known re-render and cache-management problems at this scale.

## Consequences

Each kind of state uses the tool designed for it: view state is trivial and synchronous, server state gets robust caching and invalidation for free, and the boundary between "what the user is doing" and "what is persisted" stays clear. The cost is two state libraries to learn and a rule the team must follow about which state goes where; the rule is simple (does it live in SQLite? then React Query) and is reinforced by the IPC contract from ADR-0003.
