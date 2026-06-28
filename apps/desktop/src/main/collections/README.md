# Collections Module

The application-layer service for collection management (Phase 4). It orchestrates the collection, folder, request, and history repositories to provide the explorer experience: a virtualizable tree, move/copy, favorites, history, and search — scaling to tens of thousands of requests.

See [Architecture.md](./Architecture.md) and [Phase 4](../../../../../docs/PHASE_4.md).

## Public API

`CollectionExplorer` — construct it with a `PersistenceService`:

- Collections: `listCollections`, `createCollection`, `renameCollection`, `deleteCollection`.
- Folders: `createFolder`, `renameFolder`, `moveFolder` (cycle-guarded), `deleteFolder`.
- Requests: `createRequest`, `renameRequest`, `updateRequest`, `moveRequest`, `copyRequest`, `deleteRequest`, `toggleFavorite`, `listFavorites`.
- Tree: `getTree(collectionId)` → flat, depth-annotated `TreeNode[]`.
- Search: `searchRequests(collectionId, query)`, `searchProject(projectId, query)`.
- History: `openRequest`, `listHistory`, `clearHistory`.

## Usage

```ts
const explorer = new CollectionExplorer(persistence);
const collection = explorer.createCollection({ projectId, name: 'API' });
const folder = explorer.createFolder({ collectionId: collection.id, name: 'users' });
explorer.createRequest({ collectionId: collection.id, folderId: folder.id, name: 'list', method: 'GET', url: '/users' });

const tree = explorer.getTree(collection.id);     // flat nodes for virtualization
const hits = explorer.searchRequests(collection.id, 'users');
explorer.toggleFavorite(requestId);
explorer.openRequest(requestId);                   // records history
```

## Notes

`getTree` returns a flat, depth-annotated list (folders before requests within a parent, ordered by position then name) so the renderer can virtualize it with `react-window`. `moveFolder` rejects moves into a folder's own descendants and across collections. Deletes cascade through the schema's foreign keys (deleting a folder removes its sub-folders and requests; deleting a collection removes everything under it).

## Renderer surface

The renderer consumes these through the typed IPC contract via `renderer/src/features/collections/use-collections.ts`, with the virtualized `CollectionTree` and the `CollectionsPage`.
