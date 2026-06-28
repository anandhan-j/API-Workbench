import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Workspace, CreateWorkspaceInput } from '@shared/persistence';
import type { AppDatabase } from '../types';
import { NotFoundError } from '../types';
import { workspaces } from '../schema';
import type { WorkspaceRow } from '../schema';

function toDto(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    settings: row.settings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Data access for workspaces. */
export class WorkspaceRepository {
  constructor(private readonly db: AppDatabase) {}

  create(input: CreateWorkspaceInput): Workspace {
    const now = Date.now();
    const row: WorkspaceRow = {
      id: randomUUID(),
      name: input.name,
      settings: input.settings ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(workspaces).values(row).run();
    return toDto(row);
  }

  findById(id: string): Workspace | undefined {
    const row = this.db.select().from(workspaces).where(eq(workspaces.id, id)).get();
    return row ? toDto(row) : undefined;
  }

  get(id: string): Workspace {
    const found = this.findById(id);
    if (!found) throw new NotFoundError('Workspace', id);
    return found;
  }

  list(): Workspace[] {
    return this.db.select().from(workspaces).all().map(toDto);
  }

  rename(id: string, name: string): Workspace {
    return this.update(id, { name });
  }

  update(id: string, patch: Partial<Pick<Workspace, 'name' | 'settings'>>): Workspace {
    const existing = this.get(id);
    const next: WorkspaceRow = {
      id: existing.id,
      name: patch.name ?? existing.name,
      settings: patch.settings ?? existing.settings,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.db.update(workspaces).set(next).where(eq(workspaces.id, id)).run();
    return toDto(next);
  }

  delete(id: string): void {
    this.get(id);
    this.db.delete(workspaces).where(eq(workspaces.id, id)).run();
  }
}
