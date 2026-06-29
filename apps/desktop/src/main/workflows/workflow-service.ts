import { randomUUID } from 'node:crypto';
import type { ExecutionResponse } from '@shared/execution';
import {
  WORKFLOW_EXPORT_FORMAT,
  type CreateWorkflowInput,
  type ImportWorkflowInput,
  type RequestNodeConfig,
  type SaveWorkflowInput,
  type Workflow,
  type WorkflowDetail,
  type WorkflowExport,
  type WorkflowExportItem,
  type WorkflowGraph,
  type WorkflowInputRequest,
  type WorkflowInputResult,
  type WorkflowRunRequest,
  type WorkflowRunResult,
} from '@shared/workflow';
import type { PersistenceService } from '../persistence/persistence-service';
import type { WorkflowRow } from '../persistence/schema';
import { WorkflowError } from './errors';
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
  /** Stamped into export bundles for diagnostics; optional. */
  appVersion?: string;
}

/**
 * Rewrites sub-workflow references in a graph using a map of old→new workflow
 * ids, so a bundle's internal links survive the fresh ids assigned on import.
 * References not present in the map (dangling) are left untouched.
 */
function remapSubWorkflowIds(graph: WorkflowGraph, idMap: Map<string, string>): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.kind === 'sub-workflow' && idMap.has(node.config.workflowId)
        ? { ...node, config: { ...node.config, workflowId: idMap.get(node.config.workflowId) as string } }
        : node,
    ),
  };
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

  // --- Export / import ---

  /**
   * Produces a self-contained export of a workflow: the workflow itself plus
   * every sub-workflow it references transitively, each carried with its full
   * graph. Dangling sub-workflow references (the target no longer exists) are
   * skipped rather than failing the export.
   */
  exportWorkflow(id: string, now: number = Date.now()): WorkflowExport {
    this.persistence.workflows.get(id); // validates existence
    const collected = new Map<string, WorkflowExportItem>();
    const queue: string[] = [id];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (collected.has(current)) continue;
      const row = this.persistence.workflows.findById(current);
      if (!row) continue;
      collected.set(current, {
        id: row.id,
        name: row.name,
        description: row.description,
        graph: row.graph,
      });
      for (const node of row.graph.nodes) {
        if (node.kind === 'sub-workflow' && node.config.workflowId) {
          queue.push(node.config.workflowId);
        }
      }
    }
    return {
      formatVersion: WORKFLOW_EXPORT_FORMAT,
      exportedAt: now,
      ...(this.deps.appVersion ? { appVersion: this.deps.appVersion } : {}),
      rootId: id,
      workflows: [...collected.values()],
    };
  }

  /**
   * Imports an export bundle into a project, creating a fresh workflow (and a
   * fresh copy of each bundled sub-workflow) with new ids; sub-workflow links
   * between the bundled workflows are remapped to the new ids. Returns the new
   * root workflow.
   */
  importWorkflow(input: ImportWorkflowInput): WorkflowDetail {
    this.persistence.projects.get(input.projectId); // validates existence
    const { data } = input;
    return this.persistence.transaction(() => {
      const idMap = new Map<string, string>();
      for (const item of data.workflows) idMap.set(item.id, randomUUID());

      const now = Date.now();
      for (const item of data.workflows) {
        this.persistence.workflows.create({
          id: idMap.get(item.id) as string,
          projectId: input.projectId,
          name: item.name.trim() || 'Imported workflow',
          description: item.description?.trim() ? item.description.trim() : null,
          graph: remapSubWorkflowIds(item.graph, idMap),
          createdAt: now,
          updatedAt: now,
        });
      }

      const newRootId = idMap.get(data.rootId);
      if (!newRootId) throw new WorkflowError(`Export root "${data.rootId}" is missing from the bundle`);
      return this.toDetail(this.persistence.workflows.get(newRootId));
    });
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
