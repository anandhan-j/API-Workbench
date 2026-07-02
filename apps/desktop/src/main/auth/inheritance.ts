import type { WireAuthConfig } from '@shared/auth';

/**
 * Folder-auth inheritance resolution (ADR-0009).
 *
 * A request (or folder) whose auth is `{ type: 'inherit' }` takes its effective
 * auth from the nearest ancestor that carries a concrete config. This resolver
 * walks the folder parent chain and, if no folder carries a config, falls back
 * to the collection's own auth (the top of the chain). If the collection has no
 * concrete config either, resolution is `{ type: 'none' }` — "no authorization".
 *
 * `none` is distinct from `inherit`: an explicit `none` on a folder or the
 * collection stops the walk (that subtree is deliberately unauthenticated). A
 * null/absent folder auth is treated as `inherit` (the default for every folder).
 *
 * Kept free of persistence/Electron imports so it is unit-testable; the caller
 * supplies the lookups it needs.
 */
export interface InheritanceLookups {
  /** A folder's parent id and its own auth, or undefined if it doesn't exist. */
  folder(id: string): { parentId: string | null; auth: WireAuthConfig | null } | undefined;
  /** A request's containing folder id and collection id, or undefined if missing. */
  request(id: string): { folderId: string | null; collectionId: string } | undefined;
  /** A collection's own auth (top of the chain), or undefined if it doesn't exist. */
  collectionAuth(id: string): WireAuthConfig | null | undefined;
}

const NONE: WireAuthConfig = { type: 'none' };

/** Whether a config participates in inheritance (absent/null or explicit inherit). */
function isInherit(auth: WireAuthConfig | null | undefined): boolean {
  return !auth || auth.type === 'inherit';
}

/**
 * Resolves the effective auth for an `inherit` origin by walking its folder
 * chain and finally the collection. Pass either the origin request's id (its
 * folder and collection are looked up) or a starting `folderId`/`collectionId`
 * directly. Returns `{ type: 'none' }` when nothing concrete is found.
 */
export function resolveInheritedAuth(
  origin: { requestId?: string; folderId?: string | null; collectionId?: string },
  lookups: InheritanceLookups,
): WireAuthConfig {
  let folderId: string | null | undefined = origin.folderId;
  let collectionId: string | undefined = origin.collectionId;
  if (folderId === undefined && origin.requestId) {
    const req = lookups.request(origin.requestId);
    folderId = req?.folderId ?? null;
    collectionId = collectionId ?? req?.collectionId;
  }

  const seen = new Set<string>();
  while (folderId) {
    if (seen.has(folderId)) break; // defensive: never loop on a corrupt cycle
    seen.add(folderId);
    const folder = lookups.folder(folderId);
    if (!folder) break;
    if (!isInherit(folder.auth)) return folder.auth as WireAuthConfig;
    folderId = folder.parentId;
  }

  // Top of the chain: fall back to the collection's own auth.
  if (collectionId) {
    const collectionAuth = lookups.collectionAuth(collectionId);
    if (!isInherit(collectionAuth)) return collectionAuth as WireAuthConfig;
  }
  return NONE;
}
