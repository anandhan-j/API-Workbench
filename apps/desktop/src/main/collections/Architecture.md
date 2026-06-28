# Collections — Architecture

This module is the application service for Phase 4. Like the workspace service, it holds no data access of its own: it composes the collection/folder/request/history repositories into the explorer use cases. The design is shaped by one demanding acceptance criterion — staying responsive with 10,000+ requests — which drives both the data model and the tree representation.

## Data model

Collections belong to projects; folders belong to collections and nest via a self-referencing `parentId`; requests belong to a collection and optionally a folder; history rows reference requests. Every relationship is a cascading foreign key, so deleting a collection, folder, or project removes everything beneath it in a single statement rather than in application code. Indexes on `collection_id`, `folder_id`, `parent_id`, and `favorite` keep the explorer's queries — list by collection, list favorites, search — fast at scale. These are defined in `../persistence/schema.ts` and created by migration `0002`.

## Flat tree for virtualization

`getTree` does not return a nested structure. It returns a **flat, depth-annotated list** of nodes in display order: within each parent, folders first then requests, each ordered by `position` then name. This shape is deliberate. A flat list maps directly onto a windowing list component (`react-window`) in the renderer, which mounts only the visible rows. That combination — flat data plus row virtualization — is what lets a collection of tens of thousands of nodes scroll smoothly while only a few dozen DOM nodes exist at any time. Building the flat list is a single O(n) pass over the collection's folders and requests, grouped by parent and walked depth-first.

## Move, copy, and cycle safety

Moving a request only changes its `folderId`, validated to stay within the same collection. Moving a folder is the subtle case: a folder may not be moved into itself or into any of its own descendants, which would create a cycle and orphan a subtree. `moveFolder` computes the descendant set of the folder being moved (an iterative walk over the collection's folders) and rejects the move if the target is among them. Copy duplicates a request row with a new id and a "(copy)" suffix.

## Search and history

Search is delegated to the repository as an indexed `LIKE` over name, URL, and method, scoped to a collection (or fanned out across a project's collections). History records an append-only row each time a request is opened; listing joins to the request for display, orders by recency, and de-duplicates by request so the most recent open of each request is shown once.

## Testability and boundary

The service depends only on `PersistenceService`, so it inherits the layer's driver independence and is tested against sql.js — including a 10,000-request scale test that asserts tree construction and search complete well within generous time bounds. It imports no Electron API; the composition root constructs it and the IPC layer exposes its methods as validated channels, preserving the dependency direction.
