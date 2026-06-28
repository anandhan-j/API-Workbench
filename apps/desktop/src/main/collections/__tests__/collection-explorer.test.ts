// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { requests as requestsTable } from '../../persistence/schema';
import { CollectionExplorer } from '../collection-explorer';

describe('CollectionExplorer', () => {
  let dir: string;
  let service: PersistenceService;
  let explorer: CollectionExplorer;
  let projectId: string;
  let collectionId: string;

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-col-'));
    service = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    explorer = new CollectionExplorer(service);
    const ws = service.workspaces.create({ name: 'WS' });
    projectId = service.projects.create({ workspaceId: ws.id, name: 'P' }).id;
    collectionId = explorer.createCollection({ projectId, name: 'API' }).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('builds a depth-annotated tree of folders and requests', () => {
    const folder = explorer.createFolder({ collectionId, name: 'v1' });
    const sub = explorer.createFolder({ collectionId, parentId: folder.id, name: 'users' });
    explorer.createRequest({ collectionId, folderId: sub.id, name: 'list', method: 'GET', url: '/users' });
    explorer.createRequest({ collectionId, name: 'root-req', method: 'POST', url: '/' });

    const tree = explorer.getTree(collectionId);
    const byName = Object.fromEntries(tree.map((n) => [n.name, n]));
    expect(byName['v1'].depth).toBe(0);
    expect(byName['users'].depth).toBe(1);
    expect(byName['list'].depth).toBe(2);
    expect(byName['root-req'].depth).toBe(0);
  });

  it('moves a request into a folder and prevents cross-collection moves', () => {
    const folder = explorer.createFolder({ collectionId, name: 'f' });
    const req = explorer.createRequest({ collectionId, name: 'r' });
    const moved = explorer.moveRequest(req.id, folder.id);
    expect(moved.folderId).toBe(folder.id);

    const other = explorer.createCollection({ projectId, name: 'Other' });
    const otherFolder = explorer.createFolder({ collectionId: other.id, name: 'of' });
    expect(() => explorer.moveRequest(req.id, otherFolder.id)).toThrow();
  });

  it('prevents moving a folder into its own descendant', () => {
    const a = explorer.createFolder({ collectionId, name: 'a' });
    const b = explorer.createFolder({ collectionId, parentId: a.id, name: 'b' });
    expect(() => explorer.moveFolder(a.id, b.id)).toThrow();
    expect(() => explorer.moveFolder(a.id, a.id)).toThrow();
    // moving b to root is fine
    expect(explorer.moveFolder(b.id, null).parentId).toBeNull();
  });

  it('copies a request', () => {
    const req = explorer.createRequest({ collectionId, name: 'orig', method: 'PUT', url: '/x' });
    const copy = explorer.copyRequest(req.id);
    expect(copy.id).not.toBe(req.id);
    expect(copy.name).toBe('orig (copy)');
    expect(copy.method).toBe('PUT');
  });

  it('toggles favorites and lists them', () => {
    const r1 = explorer.createRequest({ collectionId, name: 'a' });
    explorer.createRequest({ collectionId, name: 'b' });
    explorer.toggleFavorite(r1.id);
    const favs = explorer.listFavorites(collectionId);
    expect(favs.map((r) => r.id)).toEqual([r1.id]);
    explorer.toggleFavorite(r1.id);
    expect(explorer.listFavorites(collectionId)).toHaveLength(0);
  });

  it('searches by name, url, and method', () => {
    explorer.createRequest({ collectionId, name: 'get user', method: 'GET', url: '/users/1' });
    explorer.createRequest({ collectionId, name: 'create order', method: 'POST', url: '/orders' });
    expect(explorer.searchRequests(collectionId, 'user').length).toBe(1);
    expect(explorer.searchRequests(collectionId, 'orders').length).toBe(1);
    expect(explorer.searchRequests(collectionId, 'POST').length).toBe(1);
    expect(explorer.searchRequests(collectionId, '').length).toBe(0);
  });

  it('records, dedupes, and clears history', () => {
    const r1 = explorer.createRequest({ collectionId, name: 'a' });
    const r2 = explorer.createRequest({ collectionId, name: 'b' });
    explorer.openRequest(r1.id, 1);
    explorer.openRequest(r2.id, 2);
    explorer.openRequest(r1.id, 3);
    const history = explorer.listHistory();
    expect(history.map((h) => h.requestId)).toEqual([r1.id, r2.id]);
    explorer.clearHistory();
    expect(explorer.listHistory()).toHaveLength(0);
  });

  it('cascades deletes through folders and collections', () => {
    const folder = explorer.createFolder({ collectionId, name: 'f' });
    explorer.createRequest({ collectionId, folderId: folder.id, name: 'r' });
    explorer.deleteFolder(folder.id);
    expect(explorer.getTree(collectionId)).toHaveLength(0);

    explorer.createRequest({ collectionId, name: 'standalone' });
    explorer.deleteCollection(collectionId);
    expect(explorer.listCollections(projectId).find((c) => c.id === collectionId)).toBeUndefined();
  });

  it('stays responsive with 10,000 requests', () => {
    const N = 10_000;
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
    const now = Date.now();
    service.transaction(() => {
      for (let start = 0; start < N; start += 1000) {
        const chunk = [];
        for (let i = start; i < Math.min(start + 1000, N); i++) {
          chunk.push({
            id: `req-${i}`,
            collectionId,
            folderId: null,
            name: `request-${i}`,
            method: methods[i % methods.length],
            url: `https://api.example.com/items/${i}`,
            favorite: i % 50 === 0,
            position: i,
            createdAt: now,
            updatedAt: now,
          });
        }
        service.db.insert(requestsTable).values(chunk).run();
      }
    });

    const t0 = performance.now();
    const tree = explorer.getTree(collectionId);
    const treeMs = performance.now() - t0;
    expect(tree).toHaveLength(N);

    const s0 = performance.now();
    const found = explorer.searchRequests(collectionId, 'items/1234');
    const searchMs = performance.now() - s0;
    expect(found).toHaveLength(1);

    expect(explorer.listFavorites(collectionId)).toHaveLength(N / 50);
    // generous bounds; the data layer should be well under these
    expect(treeMs).toBeLessThan(5000);
    expect(searchMs).toBeLessThan(2000);
  });
});
