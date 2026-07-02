import type {
  LoopNodeConfig,
  NodeRunResult,
  WorkflowDetail,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowRunStatus,
} from '@shared/workflow';
import { applyTransform, extractAll } from '@shared/extract';
import type { RunContext, RunControl, WorkflowEnginePorts } from './workflow-engine';

/**
 * Built-in node executors (Phase 16).
 *
 * Each arm of the former `WorkflowEngine.executeNode` switch lives here as a
 * standalone executor keyed by node kind. The engine resolves executors through
 * a `NodeExecutorRegistry`, which is seeded with this exhaustive record — the
 * mapped type preserves the compile-time guarantee the switch's `never` check
 * used to give: adding a `WorkflowNodeKind` without an executor is a type error.
 */

/** The result of running a node plus the branch handle it selected. */
export interface NodeOutcome {
  result: NodeRunResult;
  handle: string | null;
}

/**
 * Everything a node executor may need from the engine for one attempt. The
 * engine constructs this per node execution; executors stay free of engine
 * internals (recursion, policy, progress) which remain the engine's job.
 */
export interface NodeExecutionEnv {
  ctx: RunContext;
  control: RunControl;
  ports: WorkflowEnginePorts;
  /** Base fields for this node's result (nodeId, kind, name, startedAt). */
  base: Pick<NodeRunResult, 'nodeId' | 'kind' | 'name' | 'startedAt'>;
  /** Elapsed milliseconds since the node started. */
  done(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Evaluates a condition expression against the run context. */
  truthy(expression: string): boolean;
  /** Runs a loaded child workflow inline (nested run sharing this run's state). */
  runSubWorkflow(workflow: WorkflowDetail): Promise<WorkflowRunStatus>;
  /** Per-run loop iteration counters keyed by node id. */
  loopCounters: Map<string, number>;
}

/** A built-in executor receives the node narrowed to its own kind. */
export type BuiltinNodeExecutors = {
  [K in WorkflowNodeKind]: (
    node: Extract<WorkflowNode, { kind: K }>,
    env: NodeExecutionEnv,
  ) => Promise<NodeOutcome> | NodeOutcome;
};

function shouldLoop(
  config: LoopNodeConfig,
  count: number,
  truthy: (expression: string) => boolean,
): boolean {
  if (config.mode === 'times') return count < config.times;
  return count < config.maxIterations && truthy(config.condition);
}

export const BUILTIN_NODE_EXECUTORS: BuiltinNodeExecutors = {
  start: (_node, env) => ({
    result: { ...env.base, status: 'success', durationMs: env.done() },
    handle: null,
  }),

  end: (_node, env) => ({
    result: { ...env.base, status: 'success', durationMs: env.done() },
    handle: null,
  }),

  'set-variable': (node, env) => {
    const value = env.ports.evaluate(node.config.value, env.ctx);
    const scope = node.config.scope ?? 'runtime';
    // Persist to the durable store for workspace/global; always set it in the
    // run's runtime too so later steps in this run can read it immediately.
    if (scope !== 'runtime') env.ports.setVariable?.(scope, node.config.key, value, env.ctx);
    return {
      result: {
        ...env.base,
        status: 'success',
        durationMs: env.done(),
        variablesSet: { [node.config.key]: value },
        message:
          scope === 'runtime'
            ? `${node.config.key} = ${value}`
            : `${node.config.key} = ${value} (${scope})`,
      },
      handle: null,
    };
  },

  delay: async (node, env) => {
    await env.sleep(node.config.ms, env.control.signal);
    return {
      result: {
        ...env.base,
        status: 'success',
        durationMs: env.done(),
        message: `Waited ${node.config.ms} ms`,
      },
      handle: null,
    };
  },

  request: async (node, env) => {
    const response = await env.ports.executeRequest(node.config, env.ctx, env.control.signal);
    const failed = Boolean(response.error);
    const extracted = failed ? {} : extractAll(response, node.config.extract ?? []);
    return {
      result: {
        ...env.base,
        status: failed ? 'failed' : 'success',
        durationMs: env.done(),
        response,
        ...(Object.keys(extracted).length ? { variablesSet: extracted } : {}),
        message: failed ? response.error : response.summary.label,
      },
      handle: null,
    };
  },

  transform: (node, env) => {
    const value = applyTransform(node.config, (t) => env.ports.evaluate(t, env.ctx));
    return {
      result: {
        ...env.base,
        status: 'success',
        durationMs: env.done(),
        variablesSet: { [node.config.variable]: value },
        message: `${node.config.variable} = ${value}`,
      },
      handle: null,
    };
  },

  'user-input': async (node, env) => {
    // Resolve each field's default template so the prompt is pre-filled.
    const fields = node.config.fields.map((f) => ({
      label: f.label,
      variable: f.variable,
      default: env.ports.evaluate(f.default, env.ctx),
      secret: f.secret,
    }));
    // Headless fallback: no input port → accept the evaluated defaults.
    if (!env.ports.requestInput) {
      const values = Object.fromEntries(fields.map((f) => [f.variable, f.default]));
      return {
        result: {
          ...env.base,
          status: 'success',
          durationMs: env.done(),
          ...(Object.keys(values).length ? { variablesSet: values } : {}),
          message: 'Auto-filled defaults (no input port)',
        },
        handle: null,
      };
    }
    const { values, cancelled } = await env.ports.requestInput(
      {
        workflowId: env.ctx.workflowId,
        nodeId: node.id,
        name: node.name,
        message: node.config.message,
        fields,
      },
      env.ctx,
    );
    if (cancelled) {
      return {
        result: {
          ...env.base,
          status: 'failed',
          durationMs: env.done(),
          message: 'Input cancelled',
        },
        handle: null,
      };
    }
    return {
      result: {
        ...env.base,
        status: 'success',
        durationMs: env.done(),
        ...(Object.keys(values).length ? { variablesSet: values } : {}),
        message: Object.keys(values).length
          ? `Collected ${Object.keys(values).length} value(s)`
          : 'Continued',
      },
      handle: null,
    };
  },

  'sub-workflow': async (node, env) => {
    const child = env.ports.loadWorkflow(node.config.workflowId);
    const childStatus = await env.runSubWorkflow(child);
    return {
      result: {
        ...env.base,
        status: childStatus === 'success' ? 'success' : 'failed',
        durationMs: env.done(),
        message: `Sub-workflow "${child.name}" ${childStatus}`,
      },
      handle: null,
    };
  },

  condition: (node, env) => {
    const handle = env.truthy(node.config.expression) ? 'true' : 'false';
    return {
      result: { ...env.base, status: 'success', durationMs: env.done(), message: `→ ${handle}` },
      handle,
    };
  },

  switch: (node, env) => {
    const value = env.ports.evaluate(node.config.value, env.ctx).trim();
    const handle = node.config.cases.includes(value) ? value : 'default';
    return {
      result: {
        ...env.base,
        status: 'success',
        durationMs: env.done(),
        message: `${value} → ${handle}`,
      },
      handle,
    };
  },

  loop: (node, env) => {
    const count = env.loopCounters.get(node.id) ?? 0;
    if (shouldLoop(node.config, count, (e) => env.truthy(e))) {
      env.loopCounters.set(node.id, count + 1);
      return {
        result: {
          ...env.base,
          status: 'success',
          durationMs: env.done(),
          message: `iteration ${count + 1}`,
        },
        handle: 'body',
      };
    }
    return {
      result: {
        ...env.base,
        status: 'success',
        durationMs: env.done(),
        message: `done after ${count}`,
      },
      handle: 'done',
    };
  },
};
