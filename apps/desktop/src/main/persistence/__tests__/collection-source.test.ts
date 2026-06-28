// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrator';
import { WorkspaceRepository } from '../repositories/workspace-repository';
import { ProjectRepository } from '../repositories/project-repository';
import { CollectionRepository } from '../repositories/collection-repository';
import { CollectionSourceRepository } from '../repositories/collection-source-repository';
import type { DatabaseConnection } from '../connection';
import { createSqlJsConnection } from './sqljs-connection';

describe('collection source URL', () => {
  let conn: DatabaseConnection;
  let sources: CollectionSourceRepository;
  let collectionId: string;

  const base = (sourceUrl?: string | null) => ({
    collectionId,
    specVersion: 'openapi-3',
    title: 'API',
    baseUrl: 'https://api.test',
    checksum: 'abc',
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
  });

  beforeEach(async () => {
    conn = await createSqlJsConnection();
    applyMigrations(conn.db);
    const ws = new WorkspaceRepository(conn.db).create({ name: 'WS' });
    const project = new ProjectRepository(conn.db).create({ workspaceId: ws.id, name: 'P' });
    collectionId = new CollectionRepository(conn.db).create({ projectId: project.id, name: 'C' }).id;
    sources = new CollectionSourceRepository(conn.db);
  });

  it('stores the import URL', () => {
    sources.upsert(base('https://api.test/openapi.json'));
    expect(sources.get(collectionId)?.sourceUrl).toBe('https://api.test/openapi.json');
  });

  it('preserves the stored URL when a later upsert omits it (text sync)', () => {
    sources.upsert(base('https://api.test/openapi.json'));
    sources.upsert(base()); // no sourceUrl provided
    expect(sources.get(collectionId)?.sourceUrl).toBe('https://api.test/openapi.json');
  });

  it('updates the URL when a new one is supplied', () => {
    sources.upsert(base('https://old.test/spec.json'));
    sources.upsert(base('https://new.test/spec.json'));
    expect(sources.get(collectionId)?.sourceUrl).toBe('https://new.test/spec.json');
  });

  it('defaults to null for a text import', () => {
    sources.upsert(base(null));
    expect(sources.get(collectionId)?.sourceUrl).toBeNull();
  });
});
