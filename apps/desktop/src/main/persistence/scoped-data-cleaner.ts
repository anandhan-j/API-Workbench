import type { VariableScope } from '@shared/variable';
import type { PersistenceService } from './persistence-service';

interface ScopeTarget {
  scope: VariableScope;
  scopeId: string;
}

/**
 * Purges the polymorphically-scoped side tables — `variables` and `auth_configs`
 * — that belong to an entity being deleted.
 *
 * These tables key their rows by `(scope, scopeId)` strings and hold **no foreign
 * keys** back to the entities they describe, so nothing cascades to them at the
 * database level. Without this cleanup, deleting a workspace / collection / folder
 * / request / workflow leaves its variables and stored credentials orphaned in the
 * database forever (and, worse, a future entity that reused the same id would
 * silently inherit them).
 *
 * Enumeration walks the **same cascade the FK constraints do** (workspace →
 * projects → collections → folders/requests, plus projects → workflows), so it
 * MUST run inside the delete transaction *before* the owning rows are removed —
 * once the cascade fires, the descendants can no longer be listed.
 */
export class ScopedDataCleaner {
  constructor(private readonly persistence: PersistenceService) {}

  /** Purges data scoped to a single request. */
  request(requestId: string): void {
    this.purge([{ scope: 'request', scopeId: requestId }]);
  }

  /** Purges data scoped to a single workflow. */
  workflow(workflowId: string): void {
    this.purge([{ scope: 'workflow', scopeId: workflowId }]);
  }

  /** Purges data scoped to a folder and every folder/request nested beneath it. */
  folder(folderId: string): void {
    const folder = this.persistence.folders.findById(folderId);
    if (!folder) return;
    this.purge(this.folderTargets(folder.collectionId, folderId));
  }

  /** Purges data scoped to a collection and all of its folders and requests. */
  collection(collectionId: string): void {
    this.purge(this.collectionTargets(collectionId));
  }

  /** Purges data scoped to every collection, folder, request and workflow in a project. */
  project(projectId: string): void {
    this.purge(this.projectTargets(projectId));
  }

  /** Purges data scoped to a workspace and everything under it. */
  workspace(workspaceId: string): void {
    const targets: ScopeTarget[] = [{ scope: 'workspace', scopeId: workspaceId }];
    for (const project of this.persistence.projects.listByWorkspace(workspaceId)) {
      targets.push(...this.projectTargets(project.id));
    }
    this.purge(targets);
  }

  // --- enumeration (mirrors the FK cascade) ---

  private projectTargets(projectId: string): ScopeTarget[] {
    // A project itself has no variable/auth scope; its children do.
    const targets: ScopeTarget[] = [];
    for (const collection of this.persistence.collections.listByProject(projectId)) {
      targets.push(...this.collectionTargets(collection.id));
    }
    for (const workflow of this.persistence.workflows.listByProject(projectId)) {
      targets.push({ scope: 'workflow', scopeId: workflow.id });
    }
    return targets;
  }

  private collectionTargets(collectionId: string): ScopeTarget[] {
    const targets: ScopeTarget[] = [{ scope: 'collection', scopeId: collectionId }];
    for (const folder of this.persistence.folders.listByCollection(collectionId)) {
      targets.push({ scope: 'folder', scopeId: folder.id });
    }
    for (const request of this.persistence.requests.listByCollection(collectionId)) {
      targets.push({ scope: 'request', scopeId: request.id });
    }
    return targets;
  }

  private folderTargets(collectionId: string, rootFolderId: string): ScopeTarget[] {
    const folderIds = this.descendantFolderIds(collectionId, rootFolderId);
    const targets: ScopeTarget[] = [];
    for (const id of folderIds) targets.push({ scope: 'folder', scopeId: id });
    for (const request of this.persistence.requests.listByCollection(collectionId)) {
      if (request.folderId && folderIds.has(request.folderId)) {
        targets.push({ scope: 'request', scopeId: request.id });
      }
    }
    return targets;
  }

  /** The folder plus every folder nested beneath it — the set the FK cascade deletes. */
  private descendantFolderIds(collectionId: string, rootFolderId: string): Set<string> {
    const childrenByParent = new Map<string | null, string[]>();
    for (const folder of this.persistence.folders.listByCollection(collectionId)) {
      const list = childrenByParent.get(folder.parentId) ?? [];
      list.push(folder.id);
      childrenByParent.set(folder.parentId, list);
    }
    const result = new Set<string>([rootFolderId]);
    const stack = [rootFolderId];
    while (stack.length) {
      const current = stack.pop() as string;
      for (const childId of childrenByParent.get(current) ?? []) {
        if (!result.has(childId)) {
          result.add(childId);
          stack.push(childId);
        }
      }
    }
    return result;
  }

  private purge(targets: ScopeTarget[]): void {
    for (const target of targets) {
      this.persistence.variables.deleteScope(target.scope, target.scopeId);
      this.persistence.authConfigs.deleteScope(target.scope, target.scopeId);
    }
  }
}
