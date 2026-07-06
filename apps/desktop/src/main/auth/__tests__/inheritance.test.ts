// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { WireAuthConfig } from '@shared/auth';
import { resolveInheritedAuth, type InheritanceLookups } from '../inheritance';

/**
 * Builds lookups over fixed tables. `folders` maps id → { parentId, auth };
 * `requests` maps request id → { folderId, collectionId }; `collections` maps
 * collection id → its own auth.
 */
function lookups(opts: {
  folders?: Record<string, { parentId: string | null; auth: WireAuthConfig | null }>;
  requests?: Record<string, { folderId: string | null; collectionId: string }>;
  collections?: Record<string, WireAuthConfig | null>;
}): InheritanceLookups {
  const { folders = {}, requests = {}, collections = {} } = opts;
  return {
    folder: (id) => folders[id],
    request: (id) => requests[id],
    collectionAuth: (id) => (id in collections ? collections[id] : undefined),
  };
}

const bearer: WireAuthConfig = { type: 'bearer', token: 't' };
const apiKey: WireAuthConfig = { type: 'apiKey', key: 'X', value: 'k', in: 'header' };
const inherit: WireAuthConfig = { type: 'inherit' };

describe('resolveInheritedAuth', () => {
  it('resolves a request to its immediate folder auth', () => {
    const repos = lookups({
      folders: { f1: { parentId: null, auth: bearer } },
      requests: { r1: { folderId: 'f1', collectionId: 'c1' } },
    });
    expect(resolveInheritedAuth({ requestId: 'r1' }, repos)).toEqual(bearer);
  });

  it('walks up through inheriting folders to the first concrete auth', () => {
    const repos = lookups({
      folders: {
        top: { parentId: null, auth: bearer },
        mid: { parentId: 'top', auth: inherit },
        leaf: { parentId: 'mid', auth: null }, // null == inherit
      },
      requests: { r1: { folderId: 'leaf', collectionId: 'c1' } },
    });
    expect(resolveInheritedAuth({ requestId: 'r1' }, repos)).toEqual(bearer);
  });

  it('falls back to the collection auth when all folders inherit', () => {
    const repos = lookups({
      folders: {
        top: { parentId: null, auth: inherit },
        leaf: { parentId: 'top', auth: null },
      },
      requests: { r1: { folderId: 'leaf', collectionId: 'c1' } },
      collections: { c1: apiKey },
    });
    expect(resolveInheritedAuth({ requestId: 'r1' }, repos)).toEqual(apiKey);
  });

  it('uses the collection auth for a request at the collection root (no folder)', () => {
    const repos = lookups({
      requests: { r1: { folderId: null, collectionId: 'c1' } },
      collections: { c1: bearer },
    });
    expect(resolveInheritedAuth({ requestId: 'r1' }, repos)).toEqual(bearer);
  });

  it('returns none when the whole chain and the collection inherit/none', () => {
    const repos = lookups({
      folders: { top: { parentId: null, auth: null } },
      requests: { r1: { folderId: 'top', collectionId: 'c1' } },
      collections: { c1: null },
    });
    expect(resolveInheritedAuth({ requestId: 'r1' }, repos)).toEqual({ type: 'none' });
  });

  it('stops the walk at an explicit none (deliberately unauthenticated subtree)', () => {
    const repos = lookups({
      folders: {
        top: { parentId: null, auth: bearer },
        mid: { parentId: 'top', auth: { type: 'none' } },
        leaf: { parentId: 'mid', auth: inherit },
      },
      requests: { r1: { folderId: 'leaf', collectionId: 'c1' } },
      collections: { c1: apiKey }, // must NOT be reached
    });
    expect(resolveInheritedAuth({ requestId: 'r1' }, repos)).toEqual({ type: 'none' });
  });

  it('accepts a starting folderId directly', () => {
    const repos = lookups({ folders: { f1: { parentId: null, auth: bearer } } });
    expect(resolveInheritedAuth({ folderId: 'f1' }, repos)).toEqual(bearer);
  });

  it('does not loop forever on a corrupt parent cycle', () => {
    const repos = lookups({
      folders: {
        a: { parentId: 'b', auth: inherit },
        b: { parentId: 'a', auth: inherit },
      },
      collections: { c1: bearer },
    });
    // No collectionId supplied for a folderId-only origin → resolves to none.
    expect(resolveInheritedAuth({ folderId: 'a' }, repos)).toEqual({ type: 'none' });
    // With a collectionId, the cycle is broken and it falls back to the collection.
    expect(resolveInheritedAuth({ folderId: 'a', collectionId: 'c1' }, repos)).toEqual(bearer);
  });
});
