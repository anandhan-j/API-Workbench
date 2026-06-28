// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrator';
import { NotFoundError } from '../types';
import { WorkspaceRepository } from '../repositories/workspace-repository';
import { ProjectRepository } from '../repositories/project-repository';
import { PreferencesRepository } from '../repositories/preferences-repository';
import { CacheRepository } from '../repositories/cache-repository';
import type { DatabaseConnection } from '../connection';
import { createSqlJsConnection } from './sqljs-connection';

describe('repositories', () => {
  let conn: DatabaseConnection;

  beforeEach(async () => {
    conn = await createSqlJsConnection();
    applyMigrations(conn.db);
  });

  describe('workspaces', () => {
    it('creates, reads, renames, and deletes', () => {
      const repo = new WorkspaceRepository(conn.db);
      const ws = repo.create({ name: 'Default', settings: { theme: 'dark' } });
      expect(ws.id).toBeTruthy();
      expect(repo.get(ws.id).name).toBe('Default');
      expect(repo.get(ws.id).settings).toEqual({ theme: 'dark' });

      const renamed = repo.rename(ws.id, 'Renamed');
      expect(renamed.name).toBe('Renamed');
      expect(renamed.updatedAt).toBeGreaterThanOrEqual(ws.createdAt);

      repo.delete(ws.id);
      expect(repo.findById(ws.id)).toBeUndefined();
    });

    it('throws NotFoundError for a missing workspace', () => {
      const repo = new WorkspaceRepository(conn.db);
      expect(() => repo.get('nope')).toThrow(NotFoundError);
    });
  });

  describe('projects', () => {
    it('lists by workspace and cascades on workspace delete', () => {
      const workspaces = new WorkspaceRepository(conn.db);
      const projects = new ProjectRepository(conn.db);
      const ws = workspaces.create({ name: 'WS' });
      projects.create({ workspaceId: ws.id, name: 'A' });
      projects.create({ workspaceId: ws.id, name: 'B' });
      expect(projects.listByWorkspace(ws.id)).toHaveLength(2);

      workspaces.delete(ws.id);
      expect(projects.listByWorkspace(ws.id)).toHaveLength(0);
    });
  });

  describe('preferences', () => {
    it('upserts and preserves JSON types', () => {
      const repo = new PreferencesRepository(conn.db);
      repo.set('window', { width: 1280, maximized: false });
      expect(repo.get('window')).toEqual({ width: 1280, maximized: false });
      repo.set('window', { width: 800, maximized: true });
      expect(repo.get('window')).toEqual({ width: 800, maximized: true });
      expect(repo.getOrDefault('missing', 42)).toBe(42);
      expect(repo.list()).toHaveLength(1);
      repo.delete('window');
      expect(repo.get('window')).toBeUndefined();
    });
  });

  describe('cache', () => {
    it('honours TTL expiry and prunes', () => {
      const repo = new CacheRepository(conn.db);
      const t0 = 1_000_000;
      repo.set('a', 'alpha', 100, t0); // expires at t0 + 100
      repo.set('b', 'beta'); // no expiry
      expect(repo.get('a', t0)).toBe('alpha');
      expect(repo.get('a', t0 + 200)).toBeUndefined();
      expect(repo.get('b', t0 + 10_000)).toBe('beta');

      repo.set('c', 'gamma', 50, t0); // expires at t0 + 50
      const removed = repo.prune(t0 + 1_000);
      expect(removed).toBeGreaterThanOrEqual(1);
      repo.clear();
      expect(repo.has('b')).toBe(false);
    });
  });
});
