import type { Migration } from './types';

/**
 * Adds the in-app AI assistant tables (ADR-0012, Phase 1).
 *
 * `ai_providers` stores bring-your-own-key provider configs; the `api_key`
 * column holds the key encrypted at rest when `encrypted` is true.
 * `ai_conversations` stores chat transcripts as a JSON array of turns.
 * Must match `../schema.ts`.
 */
export const migration0014: Migration = {
  version: 14,
  name: 'ai-assistant',
  up: `
    CREATE TABLE ai_providers (
      id            TEXT PRIMARY KEY,
      kind          TEXT NOT NULL,
      label         TEXT NOT NULL,
      base_url      TEXT,
      default_model TEXT NOT NULL,
      api_key       TEXT,
      encrypted     INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE ai_conversations (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      messages   TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_ai_conversations_updated ON ai_conversations(updated_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_ai_conversations_updated;
    DROP TABLE IF EXISTS ai_conversations;
    DROP TABLE IF EXISTS ai_providers;
  `,
};
