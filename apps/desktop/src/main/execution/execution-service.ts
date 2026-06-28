import type { ExecutionRequest, ExecutionResponse } from '@shared/execution';
import type { AuthArtifacts, AuthConfig } from '@shared/auth';
import type { HttpTransport } from './transport';
import { ExecutionEngine } from './executor';
import { buildPreparedRequest } from './builder';
import { applyAuth } from '../auth/applier';

export interface VariableContext {
  workspaceId?: string;
  collectionId?: string;
  folderId?: string;
  requestId?: string;
  workflowId?: string;
  runtime?: Record<string, string>;
}

export interface ExecutionServiceDeps {
  /** Resolves `{{variables}}` in request fields, given the request's scope context. */
  evaluate?: (template: string, context?: VariableContext) => string;
}

const EMPTY_ARTIFACTS: AuthArtifacts = { headers: {}, query: {}, cookies: {} };

function substituteAuth(config: AuthConfig, evaluate: (t: string) => string): AuthConfig {
  const walk = (v: unknown): unknown =>
    typeof v === 'string'
      ? evaluate(v)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)]))
          : v;
  return walk(config) as AuthConfig;
}

/**
 * Drives a single request execution: resolves variables, applies inline auth,
 * builds the final request, and runs it through the {@link ExecutionEngine}.
 * Stored-credential resolution (decrypting an `auth_configs` row) happens in the
 * IPC layer, which sets `request.auth` before calling `run`.
 */
export class ExecutionService {
  private readonly engine: ExecutionEngine;

  constructor(
    transport: HttpTransport,
    private readonly deps: ExecutionServiceDeps = {},
  ) {
    this.engine = new ExecutionEngine(transport);
  }

  async run(request: ExecutionRequest, signal?: AbortSignal): Promise<ExecutionResponse> {
    const ctx = request.variableContext;
    const evaluate = (template: string): string =>
      this.deps.evaluate ? this.deps.evaluate(template, ctx) : template;

    let artifacts: AuthArtifacts = EMPTY_ARTIFACTS;
    if (request.auth) {
      const resolved = substituteAuth(request.auth, evaluate);
      artifacts = applyAuth(resolved, { method: request.method, url: evaluate(request.url) });
    }

    const { prepared } = buildPreparedRequest(request, evaluate, artifacts);
    return this.engine.execute(prepared, request.options, signal);
  }
}
