// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VariableScope } from '@shared/variable';
import { PersistenceService } from '../persistence-service';
import { createSqlJsConnection } from './sqljs-connection';
import { CollectionExplorer } from '../../collections/collection-explorer';
import { WorkspaceManager } from '../../workspace/workspace-manager';
import { WorkflowService } from '../../workflows/workflow-service';

/**
 * Verifies the scoped-data cleanup that runs on entity deletion: `variables` and
 * `auth_configs` are keyed by (scope, scopeId) strings with no FK, so nothing
 * cascades to them — the delete paths must purge them explicitly.
 */
describe('ScopedDataCleaner (orphan cleanup on delete)', () => {
  let dir: string;
  let service: PersistenceService;
  let explorer: CollectionExplorer;
  let workspaces: WorkspaceManager;
  let workflows: WorkflowService;

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-clean-'));
    service = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    explorer = new CollectionExplorer(service);
    workspaces = new WorkspaceManager(service, { appVersion: '0.1.0' });
    workflows = new WorkflowService(service, {
      executeRequest: async () => ({}) as never,
      evaluate: (t) => t,
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function seed(scope: VariableScope, scopeId: string): void {
    service.variables.upsert({ scope, scopeId, key: 'k', value: 'v', secret: false, encrypted: false });
    service.authConfigs.save({ scope, scopeId, name: 'cred', type: 'bearer', config: '{}', encrypted: false });
  }

  function present(scope: VariableScope, scopeId: string): boolean {
    const vars = service.variables.listByScope(scope, scopeId).length > 0;
    const auth = service.authConfigs.listByScope(scope, scopeId).length > 0;
    // Both tables must agree; the cleaner purges them together.
    expect(vars).toBe(auth);
    return vars;
  }

  it('purges a single request scope on request delete', () => {
    const ws = service.workspaces.create({ name: 'WS' });
    const projectId = service.projects.create({ workspaceId: ws.id, name: 'P' }).id;
    const collectionId = explorer.createCollection({ projectId, name: 'C' }).id;
    const req = explorer.createRequest({ collectionId, name: 'r' });
    const other = explorer.createRequest({ collectionId, name: 'r2' });
    seed('request', req.id);
    seed('request', other.id);

    explorer.deleteRequest(req.id);

    expect(present('request', req.id)).toBe(false);
    expect(present('request', other.id)).toBe(true); // sibling untouched
  });

  it('purges a folder subtree (nested folders + their requests) on folder delete', () => {
    const ws = service.workspaces.create({ name: 'WS' });
    const projectId = service.projects.create({ workspaceId: ws.id, name: 'P' }).id;
    const collectionId = explorer.createCollection({ projectId, name: 'C' }).id;
    const f1 = explorer.createFolder({ collectionId, name: 'f1' });
    const f2 = explorer.createFolder({ collectionId, parentId: f1.id, name: 'f2' });
    const inF1 = explorer.createRequest({ collectionId, folderId: f1.id, name: 'a' });
    const inF2 = explorer.createRequest({ collectionId, folderId: f2.id, name: 'b' });
    const rootReq = explorer.createRequest({ collectionId, name: 'root' });
    for (const [scope, id] of [
      ['folder', f1.id],
      ['folder', f2.id],
      ['request', inF1.id],
      ['request', inF2.id],
      ['request', rootReq.id],
    ] as const) {
      seed(scope, id);
    }

    explorer.deleteFolder(f1.id);

    expect(present('folder', f1.id)).toBe(false);
    expect(present('folder', f2.id)).toBe(false);
    expect(present('request', inF1.id)).toBe(false);
    expect(present('request', inF2.id)).toBe(false);
    expect(present('request', rootReq.id)).toBe(true); // outside the subtree
  });

  it('purges collection, folder, and request scopes on collection delete', () => {
    const ws = service.workspaces.create({ name: 'WS' });
    const projectId = service.projects.create({ workspaceId: ws.id, name: 'P' }).id;
    const collectionId = explorer.createCollection({ projectId, name: 'C' }).id;
    const folder = explorer.createFolder({ collectionId, name: 'f' });
    const req = explorer.createRequest({ collectionId, folderId: folder.id, name: 'r' });
    const otherCol = explorer.createCollection({ projectId, name: 'C2' }).id;
    seed('collection', collectionId);
    seed('folder', folder.id);
    seed('request', req.id);
    seed('collection', otherCol);

    explorer.deleteCollection(collectionId);

    expect(present('collection', collectionId)).toBe(false);
    expect(present('folder', folder.id)).toBe(false);
    expect(present('request', req.id)).toBe(false);
    expect(present('collection', otherCol)).toBe(true); // sibling collection kept
  });

  it('purges a workflow scope on workflow delete', () => {
    const ws = service.workspaces.create({ name: 'WS' });
    const projectId = service.projects.create({ workspaceId: ws.id, name: 'P' }).id;
    const wf = workflows.create({ projectId, name: 'W' });
    seed('workflow', wf.id);

    workflows.delete(wf.id);

    expect(present('workflow', wf.id)).toBe(false);
  });

  it('purges every descendant scope on project delete, leaving the workspace scope', () => {
    const ws = service.workspaces.create({ name: 'WS' });
    const projectId = service.projects.create({ workspaceId: ws.id, name: 'P' }).id;
    const collectionId = explorer.createCollection({ projectId, name: 'C' }).id;
    const folder = explorer.createFolder({ collectionId, name: 'f' });
    const req = explorer.createRequest({ collectionId, folderId: folder.id, name: 'r' });
    const wf = workflows.create({ projectId, name: 'W' });
    seed('workspace', ws.id);
    seed('collection', collectionId);
    seed('folder', folder.id);
    seed('request', req.id);
    seed('workflow', wf.id);

    workspaces.deleteProject(projectId);

    expect(present('collection', collectionId)).toBe(false);
    expect(present('folder', folder.id)).toBe(false);
    expect(present('request', req.id)).toBe(false);
    expect(present('workflow', wf.id)).toBe(false);
    expect(present('workspace', ws.id)).toBe(true); // workspace survives its project
  });

  it('purges the whole subtree on workspace delete, sparing other workspaces and globals', () => {
    const ws = service.workspaces.create({ name: 'WS' });
    const projectId = service.projects.create({ workspaceId: ws.id, name: 'P' }).id;
    const collectionId = explorer.createCollection({ projectId, name: 'C' }).id;
    const folder = explorer.createFolder({ collectionId, name: 'f' });
    const req = explorer.createRequest({ collectionId, folderId: folder.id, name: 'r' });
    const wf = workflows.create({ projectId, name: 'W' });
    seed('workspace', ws.id);
    seed('collection', collectionId);
    seed('folder', folder.id);
    seed('request', req.id);
    seed('workflow', wf.id);

    // Untouched neighbours.
    const otherWs = service.workspaces.create({ name: 'Other' });
    seed('workspace', otherWs.id);
    seed('global', '');

    workspaces.deleteWorkspace(ws.id);

    expect(present('workspace', ws.id)).toBe(false);
    expect(present('collection', collectionId)).toBe(false);
    expect(present('folder', folder.id)).toBe(false);
    expect(present('request', req.id)).toBe(false);
    expect(present('workflow', wf.id)).toBe(false);
    expect(present('workspace', otherWs.id)).toBe(true);
    expect(present('global', '')).toBe(true);
  });
});
