import { z } from 'zod';
import { ImportSource } from './openapi';

/**
 * Transport DTOs for the OpenAPI synchronization engine (Phase 6).
 */

/** safe = merge, preserving manual edits; replace = overwrite from the spec. */
export const SyncMode = z.enum(['safe', 'replace']);
export type SyncMode = z.infer<typeof SyncMode>;

/** The spec-imported baseline stored on a generated request. */
export const RequestSource = z.object({
  key: z.string(),
  method: z.string(),
  url: z.string(),
  name: z.string(),
  /** Fingerprint of the spec-imported request definition, for detail merging. */
  detailsKey: z.string().optional(),
});
export type RequestSource = z.infer<typeof RequestSource>;

export const SyncChangeType = z.enum([
  'added',
  'updated',
  'removed',
  'conflict',
  'preserved',
  'unchanged',
]);
export type SyncChangeType = z.infer<typeof SyncChangeType>;

export const SyncChange = z.object({
  type: SyncChangeType,
  key: z.string(),
  name: z.string(),
  detail: z.string().optional(),
});
export type SyncChange = z.infer<typeof SyncChange>;

export const SyncResult = z.object({
  collectionId: z.string(),
  mode: SyncMode,
  added: z.number(),
  updated: z.number(),
  removed: z.number(),
  conflicts: z.number(),
  preserved: z.number(),
  unchanged: z.number(),
  changes: z.array(SyncChange),
});
export type SyncResult = z.infer<typeof SyncResult>;

export const SyncRequest = z.object({
  collectionId: z.string(),
  mode: SyncMode.optional(),
  source: ImportSource,
});
export type SyncRequest = z.infer<typeof SyncRequest>;
