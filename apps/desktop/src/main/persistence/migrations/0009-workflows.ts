import type { Migration } from './types';

/**
 * Adds the workflow engine's persistence (Phase 12): a `workflows` table holding
 * a workflow's metadata and its serialized graph (nodes + edges) as JSON. The
 * graph is the single source of truth that both the designer and the headless
 * runtime read from. Must match `../schema.ts`.
 */
export const migration0009: Migration = {
  version: 9,
  name: 'workflows',
  up: `
    CREATE TABLE workflows (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      graph       TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE INDEX idx_workflows_project ON workflows(project_id);
  `,
  down: `
    DROP TABLE IF EXISTS workflows;
  `,
};
