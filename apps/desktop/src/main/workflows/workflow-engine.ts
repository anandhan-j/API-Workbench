import type { ProtocolResponse } from '@shared/protocol';
import type {
  NodeRunResult,
  RequestNodeConfig,
  WorkflowDetail,
  WorkflowInputRequest,
  WorkflowInputResult,
  WorkflowNode,
  WorkflowProgressEvent,
  WorkflowRunResult,
  WorkflowRunStatus,
} from '@shared/workflow';
import { evaluateCondition } from '@shared/condition';
import { WorkflowError } from './errors';
import { resolveTarget, validateGraph } from './workflow-graph';
import { BUILTIN_NODE_EXECUTORS, type NodeExecutionEnv, type NodeOutcome } from './node-executors';
import { NodeExecutorRegistry } from '../plugins/registries/node-executor-registry';

/**
 * Execution context threaded through a run. `runtime` is the mutable variable
 * map: every node reads it and set-variable/sub-workflow nodes write to it,
 * which is how values propagate from one step to the next.
 */
export interface RunContext {
  workflowId: string;
  runtime: Record<string, string>;
  /** Active workspace id, used when persisting workspace-scoped variables. */
  workspaceId?: string;
}

/** Cooperative cancellation + pause control the engine checks between nodes. */
export interface RunControl {
  signal: AbortSignal;
  /**
   * Suspends between nodes for pause and, at the top level, for step mode.
   * `nested` runs (a sub-workflow expanded inline) skip the step checkpoint so
   * the whole sub-workflow runs to completion as a single step of its parent,
   * while still honoring pause and cancellation.
   */
  waitIfPaused(nested?: boolean): Promise<void>;
}

export interface WorkflowEnginePorts {
  executeRequest(
    config: RequestNodeConfig,
    ctx: RunContext,
    signal?: AbortSignal,
  ): Promise<ProtocolResponse>;
  evaluate(template: string, ctx: RunContext): string;
  loadWorkflow(workflowId: string): WorkflowDetail;
  /**
   * Persists a variable to a durable scope (set-variable nodes with a non-runtime
   * scope). Omitted in headless/test runs that have no variable store.
   */
  setVariable?(scope: 'workspace' | 'global', key: string, value: string, ctx: RunContext): void;
  /**
   * Suspends the run at a user-input node and resolves once the user supplies (or
   * cancels) the requested values. Omitted in headless runs, where the engine
   * falls back to each field's evaluated default.
   */
  requestInput?(request: WorkflowInputRequest, ctx: RunContext): Promise<WorkflowInputResult>;
  /** Called as each node starts (`running`) and finishes (`done`), for live UI. */
  onNodeProgress?(event: WorkflowProgressEvent): void;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface RunOptions {
  runtime?: Record<string, string>;
  signal?: AbortSignal;
  control?: RunControl;
  workspaceId?: string;
}

const MAX_STEPS = 1_000_000;
const MAX_DEPTH = 25;

const NO_PAUSE: RunControl = {
  signal: new AbortController().signal,
  waitIfPaused: () => Promise.resolve(),
};

/**
 * The deterministic, headless workflow runtime (Phases 12–14).
 *
 * It walks the graph from the start node, executing one node at a time and
 * choosing the next node from the branch the node selects (condition/switch/loop
 * route along labelled edges; linear nodes follow their single edge). Each node
 * runs under its reliability policy (retry, timeout, error handling), and the
 * run can be cancelled or paused between nodes. Given the same inputs and ports
 * the run is deterministic; termination is bounded by per-loop caps and a global
 * step limit.
 */
export class WorkflowEngine {
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly registry: NodeExecutorRegistry;

  constructor(
    private readonly ports: WorkflowEnginePorts,
    registry?: NodeExecutorRegistry,
  ) {
    this.now = ports.now ?? (() => Date.now());
    this.sleep = ports.sleep ?? defaultSleep;
    this.registry = registry ?? new NodeExecutorRegistry(BUILTIN_NODE_EXECUTORS);
  }

  async run(workflow: WorkflowDetail, options: RunOptions = {}): Promise<WorkflowRunResult> {
    const startedAt = this.now();
    const control =
      options.control ??
      (options.signal
        ? { signal: options.signal, waitIfPaused: () => Promise.resolve() }
        : NO_PAUSE);
    const runtime: Record<string, string> = { ...(options.runtime ?? {}) };
    const nodeResults: NodeRunResult[] = [];
    const status = await this.runInto(
      workflow,
      runtime,
      nodeResults,
      control,
      new Set(),
      options.workspaceId,
      false,
    );
    return {
      workflowId: workflow.id,
      status,
      startedAt,
      durationMs: this.now() - startedAt,
      nodeResults,
      finalVariables: runtime,
    };
  }

  private async runInto(
    workflow: WorkflowDetail,
    runtime: Record<string, string>,
    results: NodeRunResult[],
    control: RunControl,
    stack: Set<string>,
    workspaceId?: string,
    nested = false,
  ): Promise<WorkflowRunStatus> {
    if (stack.has(workflow.id))
      throw new WorkflowError(`Sub-workflow cycle detected at "${workflow.id}"`);
    if (stack.size >= MAX_DEPTH)
      throw new WorkflowError(`Sub-workflow nesting exceeded ${MAX_DEPTH}`);
    const index = validateGraph(workflow.graph);
    const nestedStack = new Set(stack).add(workflow.id);
    const ctx: RunContext = {
      workflowId: workflow.id,
      runtime,
      ...(workspaceId ? { workspaceId } : {}),
    };
    const loopCounters = new Map<string, number>();

    let current: WorkflowNode | undefined = workflow.graph.nodes.find((n) => n.kind === 'start');
    let steps = 0;
    while (current) {
      await control.waitIfPaused(nested);
      if (control.signal.aborted) return 'cancelled';
      if (steps++ > MAX_STEPS) throw new WorkflowError('Workflow exceeded the maximum step count');

      if (current.kind === 'end') {
        const failed = current.config.outcome === 'fail';
        this.progress(workflow.id, current);
        const endResult = this.instant(
          current,
          failed ? 'failed' : 'success',
          failed ? 'Ended with failure' : undefined,
        );
        results.push(endResult);
        this.progress(workflow.id, current, endResult);
        return failed ? 'failed' : 'success';
      }

      this.progress(workflow.id, current);
      const { result, handle } = await this.executeWithPolicy(
        current,
        ctx,
        control,
        nestedStack,
        results,
        loopCounters,
      );
      results.push(result);
      this.progress(workflow.id, current, result);
      if (result.variablesSet) Object.assign(runtime, result.variablesSet);

      // A node may suspend (e.g. user-input) and be cancelled while suspended;
      // surface that as a cancelled run rather than a node failure.
      if (control.signal.aborted) return 'cancelled';

      let chosen = handle;
      if (result.status === 'failed') {
        const onError = current.policy?.onError ?? 'fail';
        if (onError === 'fail') return 'failed';
        if (onError === 'route') chosen = 'error';
        // 'continue' keeps the node's normal handle and proceeds.
      }

      const nextId = resolveTarget(index, current.id, chosen);
      if (nextId === undefined) {
        // A routed error with no error edge wired is still a failure.
        if (result.status === 'failed' && current.policy?.onError === 'route') return 'failed';
        break;
      }
      current = index.byId.get(nextId);
    }
    return 'success';
  }

  /** Runs a node under its retry/timeout policy, returning the final outcome. */
  private async executeWithPolicy(
    node: WorkflowNode,
    ctx: RunContext,
    control: RunControl,
    stack: Set<string>,
    results: NodeRunResult[],
    loopCounters: Map<string, number>,
  ): Promise<NodeOutcome> {
    const policy = node.policy ?? {};
    const attempts = (policy.retries ?? 0) + 1;
    let outcome: NodeOutcome = {
      result: this.instant(node, 'failed', 'Not executed'),
      handle: null,
    };

    for (let attempt = 1; attempt <= attempts; attempt++) {
      outcome = await this.runOnce(
        node,
        ctx,
        control,
        stack,
        results,
        loopCounters,
        policy.timeoutMs,
      );
      outcome.result.attempts = attempt;
      if (outcome.result.status !== 'failed') return outcome;
      if (attempt < attempts && !control.signal.aborted) {
        await this.sleep(policy.retryBackoffMs ?? 0, control.signal);
      }
    }
    return outcome;
  }

  /** A single execution attempt, racing against the node timeout when set. */
  private async runOnce(
    node: WorkflowNode,
    ctx: RunContext,
    control: RunControl,
    stack: Set<string>,
    results: NodeRunResult[],
    loopCounters: Map<string, number>,
    timeoutMs?: number,
  ): Promise<NodeOutcome> {
    const startedAt = this.now();
    const work = this.executeNode(node, ctx, control, stack, results, loopCounters, startedAt);
    if (!timeoutMs || timeoutMs <= 0) return work;

    const timeout = this.sleep(timeoutMs, control.signal).then<NodeOutcome>(() => ({
      result: {
        nodeId: node.id,
        kind: node.kind,
        name: node.name,
        status: 'failed',
        startedAt,
        durationMs: this.now() - startedAt,
        message: `Timed out after ${timeoutMs} ms`,
      },
      handle: null,
    }));
    return Promise.race([work, timeout]);
  }

  /** Executes one node by kind, returning its result and selected branch. */
  private async executeNode(
    node: WorkflowNode,
    ctx: RunContext,
    control: RunControl,
    stack: Set<string>,
    results: NodeRunResult[],
    loopCounters: Map<string, number>,
    startedAt: number,
  ): Promise<NodeOutcome> {
    const base = { nodeId: node.id, kind: node.kind, name: node.name, startedAt };
    const done = (): number => this.now() - startedAt;
    const env: NodeExecutionEnv = {
      ctx,
      control,
      ports: this.ports,
      base,
      done,
      sleep: this.sleep,
      truthy: (expression) => this.truthy(expression, ctx),
      // Nested run: step mode treats the sub-workflow as one step (it runs to
      // completion), so pass nested=true to bypass the per-node step checkpoint
      // while still honoring pause/cancel.
      runSubWorkflow: (child) =>
        this.runInto(child, ctx.runtime, results, control, stack, ctx.workspaceId, true),
      loopCounters,
    };
    try {
      const executor = this.registry.resolve(node.kind);
      if (!executor) throw new WorkflowError(`Unsupported node kind: ${node.kind}`);
      return await executor(node, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { result: { ...base, status: 'failed', durationMs: done(), message }, handle: null };
    }
  }

  /** Emits a `running` event (no result) or a `done` event (with result). */
  private progress(workflowId: string, node: WorkflowNode, result?: NodeRunResult): void {
    if (!this.ports.onNodeProgress) return;
    this.ports.onNodeProgress({
      workflowId,
      phase: result ? 'done' : 'running',
      nodeId: node.id,
      kind: node.kind,
      name: node.name,
      ...(result ? { result } : {}),
    });
  }

  private truthy(expression: string, ctx: RunContext): boolean {
    return evaluateCondition(expression, (template) => this.ports.evaluate(template, ctx));
  }

  /** A zero-work node result (start/end and failure sentinels). */
  private instant(
    node: WorkflowNode,
    status: NodeRunResult['status'],
    message?: string,
  ): NodeRunResult {
    const at = this.now();
    return {
      nodeId: node.id,
      kind: node.kind,
      name: node.name,
      status,
      startedAt: at,
      durationMs: 0,
      ...(message ? { message } : {}),
    };
  }
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new WorkflowError('Cancelled'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new WorkflowError('Cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
