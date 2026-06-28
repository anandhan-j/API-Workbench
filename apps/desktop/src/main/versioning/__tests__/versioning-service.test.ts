// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { CollectionExplorer } from '../../collections/collection-explorer';
import { VersioningService } from '../versioning-service';

describe('VersioningService', () => {
  let dir: string;
  let service: PersistenceService;
  let explorer: CollectionExplorer;
  let versioning: VersioningService;
  let collectionId: string;

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-ver-'));
    service = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    explorer = new CollectionExplorer(service);
    versioning = new VersioningService(service);
    const ws = service.workspaces.create({ name: 'WS' });
    const projectId = service.projects.create({ workspaceId: ws.id, name: 'P' }).id;
    collectionId = explorer.createCollection({ projectId, name: 'API' }).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('snapshots the current tree and numbers versions sequentially', () => {
    const folder = explorer.createFolder({ collectionId, name: 'users' });
    explorer.createRequest({ collectionId, folderId: folder.id, name: 'list', method: 'GET', url: '/u' });

    const v1 = versioning.snapshot(collectionId, 'first');
    expect(v1.number).toBe(1);
    expect(v1.label).toBe('first');
    expect(v1.counts).toEqual({ folders: 1, requests: 1 });

    explorer.createRequest({ collectionId, name: 'create', method: 'POST', url: '/u' });
    const v2 = versioning.snapshot(collectionId);
    expect(v2.number).toBe(2);
    expect(v2.label).toBeNull();
    expect(v2.counts.requests).toBe(2);
  });

  it('records the collection spec checksum at snapshot time', () => {
    service.collectionSources.upsert({
      collectionId,
      specVersion: 'openapi-3',
      title: 'API',
      baseUrl: 'https://api',
      checksum: 'sum-123',
    });
    const v = versioning.snapshot(collectionId);
    expect(v.checksum).toBe('sum-123');
  });

  it('lists versions newest first', () => {
    versioning.snapshot(collectionId, 'a');
    versioning.snapshot(collectionId, 'b');
    versioning.snapshot(collectionId, 'c');
    const list = versioning.listVersions(collectionId);
    expect(list.map((v) => v.number)).toEqual([3, 2, 1]);
    expect(list.map((v) => v.label)).toEqual(['c', 'b', 'a']);
  });

  it('diffs a version against the current state (added / removed / modified)', () => {
    const keep = explorer.createRequest({ collectionId, name: 'keep', method: 'GET', url: '/k' });
    const gone = explorer.createRequest({ collectionId, name: 'gone', method: 'GET', url: '/g' });
    const v1 = versioning.snapshot(collectionId);

    explorer.updateRequest(keep.id, { name: 'kept', url: '/k2' });
    explorer.deleteRequest(gone.id);
    explorer.createRequest({ collectionId, name: 'fresh', method: 'POST', url: '/f' });

    const diff = versioning.diff(v1.id);
    expect(diff.addedRequests.map((r) => r.name)).toEqual(['fresh']);
    expect(diff.removedRequests.map((r) => r.name)).toEqual(['gone']);
    expect(diff.modifiedRequests).toHaveLength(1);
    const fields = diff.modifiedRequests[0].changes.map((c) => c.field).sort();
    expect(fields).toEqual(['name', 'url']);
  });

  it('summarizes a version against its predecessor', () => {
    explorer.createRequest({ collectionId, name: 'a' });
    const v1 = versioning.snapshot(collectionId);
    explorer.createRequest({ collectionId, name: 'b' });
    explorer.createRequest({ collectionId, name: 'c' });
    const v2 = versioning.snapshot(collectionId);

    expect(versioning.changeSummary(v1.id).text).toBe('1 added');
    const s2 = versioning.changeSummary(v2.id);
    expect(s2.added).toBe(2);
    expect(s2.text).toBe('2 added');
  });

  it('restores a collection to a prior version exactly', () => {
    const v1Folder = explorer.createFolder({ collectionId, name: 'v1' });
    const sub = explorer.createFolder({ collectionId, parentId: v1Folder.id, name: 'users' });
    const req = explorer.createRequest({
      collectionId,
      folderId: sub.id,
      name: 'list',
      method: 'GET',
      url: '/users',
    });
    explorer.toggleFavorite(req.id);
    explorer.createRequest({ collectionId, name: 'root', method: 'POST', url: '/' });

    const before = explorer.getTree(collectionId);
    const snap = versioning.snapshot(collectionId, 'good');

    // Mutate heavily: delete a folder (and its request), rename, add new.
    explorer.deleteFolder(v1Folder.id);
    const lone = explorer.createRequest({ collectionId, name: 'garbage', method: 'DELETE', url: '/x' });
    explorer.renameRequest(lone.id, 'still garbage');

    const result = versioning.restore(snap.id);
    expect(result.requests).toBe(2);
    expect(result.folders).toBe(2);

    const after = explorer.getTree(collectionId);
    expect(after).toEqual(before);
    // ids preserved
    expect(after.find((n) => n.name === 'list')?.id).toBe(req.id);
    // favorite preserved
    expect(explorer.listFavorites(collectionId).map((r) => r.id)).toEqual([req.id]);
  });

  it('restores after the entire collection content is cleared', () => {
    explorer.createFolder({ collectionId, name: 'f1' });
    explorer.createRequest({ collectionId, name: 'r1' });
    const snap = versioning.snapshot(collectionId);

    // Remove everything.
    for (const node of explorer.getTree(collectionId)) {
      if (node.type === 'folder') {
        try {
          explorer.deleteFolder(node.id);
        } catch {
          // already cascaded
        }
      }
    }
    for (const node of explorer.getTree(collectionId)) {
      if (node.type === 'request') explorer.deleteRequest(node.id);
    }
    expect(explorer.getTree(collectionId)).toHaveLength(0);

    versioning.restore(snap.id);
    expect(explorer.getTree(collectionId)).toHaveLength(2);
  });

  it('diffs two versions', () => {
    explorer.createRequest({ collectionId, name: 'a' });
    const v1 = versioning.snapshot(collectionId);
    explorer.createRequest({ collectionId, name: 'b' });
    const v2 = versioning.snapshot(collectionId);

    const diff = versioning.diffVersions(v1.id, v2.id);
    expect(diff.addedRequests.map((r) => r.name)).toEqual(['b']);
    expect(diff.removedRequests).toHaveLength(0);
  });
});
