import type { Migration } from './types';

/**
 * Adds the `headers` column to `ai_providers` (ADR-0012): extra HTTP headers
 * sent to a provider, for gateways that need a routing or auth header beyond the
 * API key (e.g. pointing Claude at an enterprise Anthropic gateway). Stored as a
 * JSON object; null is treated as no extra headers. Must match `../schema.ts`.
 */
export const migration0015: Migration = {
  version: 15,
  name: 'ai-provider-headers',
  up: `
    ALTER TABLE ai_providers ADD COLUMN headers TEXT;
  `,
  // SQLite can't drop a column pre-3.35; recreate the table without it.
  down: `
    CREATE TABLE ai_providers_tmp (
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
    INSERT INTO ai_providers_tmp
      SELECT id, kind, label, base_url, default_model, api_key, encrypted, created_at, updated_at
      FROM ai_providers;
    DROP TABLE ai_providers;
    ALTER TABLE ai_providers_tmp RENAME TO ai_providers;
  `,
};
