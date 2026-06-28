// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrator';
import { WorkspaceRepository } from '../repositories/workspace-repository';
import { ProjectRepository } from '../repositories/project-repository';
import { CollectionRepository } from '../repositories/collection-repository';
import { RequestRepository } from '../repositories/request-repository';
import type { DatabaseConnection } from '../connection';
import { createSqlJsConnection } from './sqljs-connection';
import { emptyDetails } from '@shared/request-details';

describe('request details persistence', () => {
  let conn: DatabaseConnection;
  let requests: RequestRepository;
  let collectionId: string;

  beforeEach(async () => {
    conn = await createSqlJsConnection();
    applyMigrations(conn.db);
    const ws = new WorkspaceRepository(conn.db).create({ name: 'WS' });
    const project = new ProjectRepository(conn.db).create({ workspaceId: ws.id, name: 'P' });
    const collection = new CollectionRepository(conn.db).create({ projectId: project.id, name: 'C' });
    collectionId = collection.id;
    requests = new RequestRepository(conn.db);
  });

  it('defaults to empty details for a hand-created request', () => {
    const req = requests.create({ collectionId, name: 'R' });
    expect(requests.getFull(req.id).details).toEqual(emptyDetails());
  });

  it('stores details from a spec import and round-trips them', () => {
    const req = requests.createFromSpec({
      collectionId,
      name: 'Create',
      method: 'POST',
      url: 'https://api.test/pets',
      details: {
        headers: [{ key: 'X-Trace', value: 'abc', enabled: true }],
        params: [{ key: 'dryRun', value: 'true', enabled: true }],
        auth: { type: 'none' },
        body: { mode: 'raw', rawType: 'json', rawBody: '{"name":"Rex"}', formFields: [], binaryBase64: '' },
        options: { timeoutMs: 30_000, maxRetries: 0, followRedirects: true },
      },
      source: { key: 'POST /pets', method: 'POST', url: 'https://api.test/pets', name: 'Create' },
    });

    const full = requests.getFull(req.id);
    expect(full.details.headers).toEqual([{ key: 'X-Trace', value: 'abc', enabled: true }]);
    expect(full.details.body.rawBody).toBe('{"name":"Rex"}');
  });

  it('saves edited details and identity', () => {
    const req = requests.create({ collectionId, name: 'R' });
    const next = emptyDetails();
    next.headers = [{ key: 'Authorization', value: 'Bearer x', enabled: true }];
    requests.save(req.id, { name: 'Renamed', method: 'PUT', url: 'https://x.test', details: next });

    const full = requests.getFull(req.id);
    expect(full.name).toBe('Renamed');
    expect(full.method).toBe('PUT');
    expect(full.url).toBe('https://x.test');
    expect(full.details.headers[0]).toEqual({ key: 'Authorization', value: 'Bearer x', enabled: true });
  });
});
