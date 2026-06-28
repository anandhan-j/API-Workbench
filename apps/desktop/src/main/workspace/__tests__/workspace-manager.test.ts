// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { WorkspaceManager } from '../workspace-manager';

describe('WorkspaceManager', () => {
  let dir: string;
  let service: PersistenceService;
  let manager: WorkspaceManager;

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-ws-'));
    service = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    manager = new WorkspaceManager(service, { appVersion: '0.1.0' });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps multiple workspaces independent', () => {
    const a = manager.createWorkspace({ name: 'A' });
    const b = manager.createWorkspace({ name: 'B' });
    manager.createProject({ workspaceId: a.id, name: 'a1' });
    manager.createProject({ workspaceId: a.id, name: 'a2' });
    manager.createProject({ workspaceId: b.id, name: 'b1' });

    expect(manager.listProjects(a.id)).toHaveLength(2);
    expect(manager.listProjects(b.id)).toHaveLength(1);

    manager.deleteWorkspace(a.id);
    expect(manager.listWorkspaces().map((w) => w.id)).toEqual([b.id]);
    expect(manager.listProjects(b.id)).toHaveLength(1);
  });

  it('opens and closes projects and tracks the active selection', () => {
    const ws = manager.createWorkspace({ name: 'WS' });
    const project = manager.createProject({ workspaceId: ws.id, name: 'P' });

    manager.openProject(project.id, 1000);
    expect(manager.getActiveSelection()).toEqual({ workspaceId: ws.id, projectId: project.id });
    expect(manager.listRecentProjects()).toHaveLength(1);

    manager.closeProject();
    expect(manager.getActiveSelection()).toEqual({ workspaceId: ws.id, projectId: null });
  });

  it('clears the active project when switching to a different workspace', () => {
    const a = manager.createWorkspace({ name: 'A' });
    const b = manager.createWorkspace({ name: 'B' });
    const p = manager.createProject({ workspaceId: a.id, name: 'p' });
    manager.openProject(p.id);
    expect(manager.getActiveSelection().projectId).toBe(p.id);

    manager.setActiveWorkspace(b.id);
    expect(manager.getActiveSelection()).toEqual({ workspaceId: b.id, projectId: null });
  });

  it('dedupes recents by project and prunes deleted ones', () => {
    const ws = manager.createWorkspace({ name: 'WS' });
    const p1 = manager.createProject({ workspaceId: ws.id, name: 'p1' });
    const p2 = manager.createProject({ workspaceId: ws.id, name: 'p2' });

    manager.openProject(p1.id, 1);
    manager.openProject(p2.id, 2);
    manager.openProject(p1.id, 3); // re-open moves p1 to front, no duplicate
    expect(manager.listRecentProjects().map((r) => r.projectId)).toEqual([p1.id, p2.id]);

    manager.deleteProject(p2.id);
    expect(manager.listRecentProjects().map((r) => r.projectId)).toEqual([p1.id]);
  });

  it('self-heals the active selection when its workspace is deleted', () => {
    const ws = manager.createWorkspace({ name: 'WS' });
    manager.setActiveWorkspace(ws.id);
    manager.deleteWorkspace(ws.id);
    expect(manager.getActiveSelection()).toEqual({ workspaceId: null, projectId: null });
  });

  it('updates per-workspace settings', () => {
    const ws = manager.createWorkspace({ name: 'WS', settings: { a: 1 } });
    const updated = manager.updateWorkspaceSettings(ws.id, { a: 2, b: true });
    expect(updated.settings).toEqual({ a: 2, b: true });
    expect(manager.getWorkspaceDetail(ws.id).workspace.settings).toEqual({ a: 2, b: true });
  });

  it('exports and re-imports a workspace as an independent copy', () => {
    const ws = manager.createWorkspace({ name: 'Original', settings: { theme: 'dark' } });
    manager.createProject({ workspaceId: ws.id, name: 'one' });
    manager.createProject({ workspaceId: ws.id, name: 'two' });

    const exported = manager.exportWorkspace(ws.id, 5000);
    expect(exported.formatVersion).toBe(1);
    expect(exported.projects).toHaveLength(2);

    const imported = manager.importWorkspace(exported);
    expect(imported.id).not.toBe(ws.id);
    expect(imported.name).toBe('Original');
    expect(imported.settings).toEqual({ theme: 'dark' });
    expect(manager.listProjects(imported.id).map((p) => p.name).sort()).toEqual(['one', 'two']);

    // editing the import does not affect the original
    manager.deleteWorkspace(imported.id);
    expect(manager.listProjects(ws.id)).toHaveLength(2);
  });

  it('rejects an invalid import payload', () => {
    expect(() => manager.importWorkspace({ nope: true })).toThrow();
  });
});
