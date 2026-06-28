// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from '../migrator';
import { withTransaction } from '../transaction';
import { WorkspaceRepository } from '../repositories/workspace-repository';
import type { DatabaseConnection } from '../connection';
import { createSqlJsConnection } from './sqljs-connection';

describe('withTransaction', () => {
  let conn: DatabaseConnection;
  let repo: WorkspaceRepository;

  beforeEach(async () => {
    conn = await createSqlJsConnection();
    applyMigrations(conn.db);
    repo = new WorkspaceRepository(conn.db);
  });

  it('commits all writes on success', () => {
    withTransaction(conn.db, () => {
      repo.create({ name: 'one' });
      repo.create({ name: 'two' });
    });
    expect(repo.list()).toHaveLength(2);
  });

  it('rolls back every write when the unit of work throws (no data loss)', () => {
    repo.create({ name: 'pre-existing' });
    expect(() =>
      withTransaction(conn.db, () => {
        repo.create({ name: 'will-be-rolled-back' });
        throw new Error('boom');
      }),
    ).toThrow('boom');

    const names = repo.list().map((w) => w.name);
    expect(names).toEqual(['pre-existing']);
  });
});
