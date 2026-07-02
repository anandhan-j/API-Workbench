import { WorkflowNodeKind, type WorkflowNode } from '@shared/workflow';
import type {
  BuiltinNodeExecutors,
  NodeExecutionEnv,
  NodeOutcome,
} from '../../workflows/node-executors';

/**
 * Runtime registry for workflow node executors (Phase 16, ADR-0007).
 *
 * Built-in executors are supplied as an exhaustive `BuiltinNodeExecutors`
 * record, preserving the compile-time completeness check the engine's switch
 * used to provide. Plugin executors register under fully-qualified kinds
 * (`plugin:<pluginId>/<kind>`) and are looked up in a dynamic map.
 */

/** An executor after resolution — the node is no longer narrowed by kind. */
export type ResolvedNodeExecutor = (
  node: WorkflowNode,
  env: NodeExecutionEnv,
) => Promise<NodeOutcome> | NodeOutcome;

interface DynamicEntry {
  pluginId: string;
  execute: ResolvedNodeExecutor;
}

const BUILTIN_KINDS = new Set<string>(WorkflowNodeKind.options);

/** Fully-qualified plugin node kind: `plugin:<pluginId>/<kind>`. */
export function pluginNodeKind(pluginId: string, kind: string): string {
  return `plugin:${pluginId}/${kind}`;
}

export class NodeExecutorRegistry {
  private readonly dynamic = new Map<string, DynamicEntry>();

  constructor(private readonly builtins: BuiltinNodeExecutors) {}

  isBuiltin(kind: string): kind is WorkflowNodeKind {
    return BUILTIN_KINDS.has(kind);
  }

  resolve(kind: string): ResolvedNodeExecutor | undefined {
    if (this.isBuiltin(kind)) {
      // Widening cast: the record narrows `node` per kind; the engine only ever
      // dispatches a node to the executor registered under that node's kind.
      return this.builtins[kind] as ResolvedNodeExecutor;
    }
    return this.dynamic.get(kind)?.execute;
  }

  registerPlugin(pluginId: string, kind: string, execute: ResolvedNodeExecutor): void {
    const qualified = pluginNodeKind(pluginId, kind);
    if (this.dynamic.has(qualified)) {
      throw new Error(`Node kind "${qualified}" is already registered`);
    }
    this.dynamic.set(qualified, { pluginId, execute });
  }

  /** Removes every executor a plugin registered (uninstall/disable). */
  unregisterPlugin(pluginId: string): void {
    for (const [kind, entry] of this.dynamic) {
      if (entry.pluginId === pluginId) this.dynamic.delete(kind);
    }
  }

  dynamicKinds(): string[] {
    return [...this.dynamic.keys()];
  }
}
