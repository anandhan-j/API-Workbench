import { randomUUID } from 'node:crypto';
import type { ExecutionResponse } from '@shared/execution';
import type {
  CreateWorkflowInput,
  RequestNodeConfig,
  SaveWorkflowInput,
  Workflow,
  WorkflowDetail,
  WorkflowGraph,
  WorkflowInputRequest,
  WorkflowInputResult,
  WorkflowRunRequest,
  WorkflowRunResult,
} from '@shared/workflow';
import type { PersistenceService } from '../persistence/persistence-service';
import type { WorkflowRow } from '../persistence/schema';
import { WorkflowEngine, type RunContext, type RunControl } from './workflow-engine';

/** Suspends a run at a user-input node until the user replies (injected by the IPC layer). */
export type RequestInput = (
  request: WorkflowInputRequest,
  ctx: RunContext,
) => Promise<WorkflowInputResult>;

/**
 * Side-effecting capabilities the service supplies to the engine, injected from
 * the composition root so the service stays decoupled from the execution and
 * variable engines and remains testable with fakes.
 */
export interface WorkflowServiceDeps {
  executeRequest(
    config: RequestNodeConfig,
    ctx: RunContext,
    signal?: AbortSignal,
  ): Promise<ExecutionResponse>;
  evaluate(template: string, ctx: RunContext): string;
}

/** A blank graph seeded with a single start node so the canvas is never empty. */
function seedGraph(): WorkflowGraph {
  return {
    nodes: [{ id: randomUUID(), kind: 'start', name: 'Start', position: { x: 80, y: 80 }, config: {} }],
    edges: [],
    groups: [],
  };
}

/**
 * The workflow application service (Phase 12).
 *
 * Owns workflow CRUD over persistence and orchestrates runs by composing a
 * {@link WorkflowEngine} with the injected execution/variable capabilities. The
 * graph persists as the single source of truth that the designer edits and the
 * engine executes (ADR-0005).
 */
export class WorkflowService {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly deps: WorkflowServiceDeps,
  ) {}

  // --- CRUD ---

  list(projectId: string): Workflow[] {
    return this.persistence.workflows.listByProject(projectId).map((row) => this.toSummary(row));
  }

  get(id: string): WorkflowDetail {
    return this.toDetail(this.persistence.workflows.get(id));
  }

  create(input: CreateWorkflowInput): WorkflowDetail {
    this.persistence.projects.get(input.projectId); // validates existence
    const now = Date.now();
    const row = this.persistence.workflows.create({
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name.trim(),
      description: input.description?.trim() ? input.description.trim() : null,
      graph: seedGraph(),
      createdAt: now,
      updatedAt: now,
    });
    return this.toDetail(row);
  }

  save(input: SaveWorkflowInput): WorkflowDetail {
    this.persistence.workflows.get(input.id); // validates existence
    const row = this.persistence.workflows.update(input.id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() ? input.description.trim() : null }
        : {}),
      graph: input.graph,
      updatedAt: Date.now(),
    });
    return this.toDetail(row);
  }

  delete(id: string): void {
    this.persistence.workflows.delete(id);
  }

  // --- Run ---

  /** Loads the workflow and executes it deterministically through the engine. */
  async run(
    request: WorkflowRunRequest,
    control?: RunControl,
    requestInput?: RequestInput,
  ): Promise<WorkflowRunResult> {
    const workflow = this.get(request.workflowId); // validates existence
    const engine = new WorkflowEngine({
      executeRequest: this.deps.executeRequest,
      evaluate: this.deps.evaluate,
      loadWorkflow: (id) => this.get(id),
      ...(requestInput ? { requestInput } : {}),
    });
    return engine.run(workflow, {
      ...(request.runtime !== undefined ? { runtime: request.runtime } : {}),
      ...(control ? { control } : {}),
    });
  }

  // --- Mappers ---

  private toSummary(row: WorkflowRow): Workflow {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      nodeCount: row.graph.nodes.length,
    };
  }

  private toDetail(row: WorkflowRow): WorkflowDetail {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      graph: row.graph,
    };
  }
}
