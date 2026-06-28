import { asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../types';
import { NotFoundError } from '../types';
import { workflows } from '../schema';
import type { WorkflowRow, WorkflowInsert } from '../schema';

/** Data access for workflow definitions (Phase 12). */
export class WorkflowRepository {
  constructor(private readonly db: AppDatabase) {}

  create(row: WorkflowInsert): WorkflowRow {
    this.db.insert(workflows).values(row).run();
    return this.get(row.id);
  }

  findById(id: string): WorkflowRow | undefined {
    return this.db.select().from(workflows).where(eq(workflows.id, id)).get();
  }

  get(id: string): WorkflowRow {
    const found = this.findById(id);
    if (!found) throw new NotFoundError('Workflow', id);
    return found;
  }

  /** Workflows in a project, ordered by name for a stable listing. */
  listByProject(projectId: string): WorkflowRow[] {
    return this.db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .orderBy(asc(workflows.name))
      .all();
  }

  update(id: string, changes: Partial<Pick<WorkflowRow, 'name' | 'description' | 'graph' | 'updatedAt'>>): WorkflowRow {
    this.get(id); // validates existence
    this.db.update(workflows).set(changes).where(eq(workflows.id, id)).run();
    return this.get(id);
  }

  delete(id: string): void {
    this.db.delete(workflows).where(eq(workflows.id, id)).run();
  }
}
