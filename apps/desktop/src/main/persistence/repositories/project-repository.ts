import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Project, CreateProjectInput } from '@shared/persistence';
import type { AppDatabase } from '../types';
import { NotFoundError } from '../types';
import { projects } from '../schema';
import type { ProjectRow } from '../schema';

function toDto(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Data access for projects within a workspace. */
export class ProjectRepository {
  constructor(private readonly db: AppDatabase) {}

  create(input: CreateProjectInput): Project {
    const now = Date.now();
    const row: ProjectRow = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(projects).values(row).run();
    return toDto(row);
  }

  findById(id: string): Project | undefined {
    const row = this.db.select().from(projects).where(eq(projects.id, id)).get();
    return row ? toDto(row) : undefined;
  }

  get(id: string): Project {
    const found = this.findById(id);
    if (!found) throw new NotFoundError('Project', id);
    return found;
  }

  listByWorkspace(workspaceId: string): Project[] {
    return this.db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .all()
      .map(toDto);
  }

  rename(id: string, name: string): Project {
    const existing = this.get(id);
    const next: ProjectRow = { ...existing, name, updatedAt: Date.now() };
    this.db.update(projects).set(next).where(eq(projects.id, id)).run();
    return toDto(next);
  }

  delete(id: string): void {
    this.get(id);
    this.db.delete(projects).where(eq(projects.id, id)).run();
  }
}
