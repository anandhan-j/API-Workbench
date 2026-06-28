import vm from 'node:vm';
import type { ExecutionResponse } from '@shared/execution';
import type { VariableContext, VariableScope } from '@shared/variable';
import type { ScriptRunResult, ScriptTestResult, ScriptVarChange, ScriptVarScope } from '@shared/scripting';

/** What the runner needs from the variable engine (kept narrow for testing). */
export interface VariableBackend {
  set(input: { scope: VariableScope; scopeId?: string; key: string; value: string }): void;
  delete(scope: VariableScope, key: string, scopeId?: string): void;
  resolve(context: VariableContext): Map<string, { value: string }>;
}

/** Read-only view of the outgoing request given to a pre-request script. */
export interface ScriptRequestInfo {
  method: string;
  url: string;
  headers: Record<string, string>;
}

export interface RunPostResponseDeps {
  code: string;
  response: ExecutionResponse;
  context: VariableContext;
  variables: VariableBackend;
  timeoutMs?: number;
}

export interface RunPreRequestDeps {
  code: string;
  request: ScriptRequestInfo;
  context: VariableContext;
  variables: VariableBackend;
  timeoutMs?: number;
}

function engineScope(
  scope: ScriptVarScope,
  context: VariableContext,
): { scope: VariableScope; scopeId?: string } {
  switch (scope) {
    case 'global':
      return { scope: 'global' };
    case 'environment':
      return { scope: 'workspace', ...(context.workspaceId ? { scopeId: context.workspaceId } : {}) };
    case 'collection':
      return { scope: 'collection', ...(context.collectionId ? { scopeId: context.collectionId } : {}) };
    case 'local':
      return context.requestId
        ? { scope: 'request', scopeId: context.requestId }
        : { scope: 'global' };
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A tiny chai-like expectation supporting the assertions used in practice. */
function makeExpect(actual: unknown): unknown {
  const fail = (msg: string): never => {
    throw new Error(msg);
  };
  const eql = (e: unknown): void => {
    if (JSON.stringify(actual) !== JSON.stringify(e))
      fail(`expected ${JSON.stringify(actual)} to deeply equal ${JSON.stringify(e)}`);
  };
  const equal = (e: unknown): void => {
    if (actual !== e) fail(`expected ${JSON.stringify(actual)} to equal ${JSON.stringify(e)}`);
  };
  const include = (s: unknown): void => {
    if (!String(actual).includes(String(s))) fail(`expected "${String(actual)}" to include "${String(s)}"`);
  };
  const be = {
    below: (n: number): void => {
      if (!((actual as number) < n)) fail(`expected ${actual} to be below ${n}`);
    },
    above: (n: number): void => {
      if (!((actual as number) > n)) fail(`expected ${actual} to be above ${n}`);
    },
    oneOf: (arr: unknown[]): void => {
      if (!arr.includes(actual)) fail(`expected ${JSON.stringify(actual)} to be one of ${JSON.stringify(arr)}`);
    },
    a: (t: string): void => {
      if (typeof actual !== t) fail(`expected ${JSON.stringify(actual)} to be a ${t}`);
    },
    true: (): void => {
      if (actual !== true) fail(`expected ${JSON.stringify(actual)} to be true`);
    },
    false: (): void => {
      if (actual !== false) fail(`expected ${JSON.stringify(actual)} to be false`);
    },
    null: (): void => {
      if (actual !== null) fail(`expected ${JSON.stringify(actual)} to be null`);
    },
    undefined: (): void => {
      if (actual !== undefined) fail(`expected ${JSON.stringify(actual)} to be undefined`);
    },
  };
  return {
    to: {
      equal,
      eql,
      include,
      be,
      not: {
        equal: (e: unknown): void => {
          if (actual === e) fail(`expected ${JSON.stringify(actual)} to not equal ${JSON.stringify(e)}`);
        },
        eql: (e: unknown): void => {
          if (JSON.stringify(actual) === JSON.stringify(e)) fail(`expected values to differ`);
        },
      },
      have: {
        property: (name: string): void => {
          if (!(actual && typeof actual === 'object' && name in (actual as object)))
            fail(`expected object to have property "${name}"`);
        },
        lengthOf: (n: number): void => {
          const len = (actual as { length?: number })?.length;
          if (len !== n) fail(`expected length ${len} to be ${n}`);
        },
      },
    },
  };
}

interface ScriptState {
  logs: string[];
  tests: ScriptTestResult[];
  changes: ScriptVarChange[];
  overlay: Map<string, string>;
}

/** Builds the shared `pm` members (variables, test, expect) and a console. */
function buildCore(variables: VariableBackend, context: VariableContext) {
  const state: ScriptState = { logs: [], tests: [], changes: [], overlay: new Map() };
  for (const [key, v] of variables.resolve(context)) state.overlay.set(key, v.value);

  const log = (...args: unknown[]): void => {
    state.logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };

  const makeScopeApi = (scope: ScriptVarScope): Record<string, unknown> => ({
    set: (key: string, value: unknown): void => {
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      variables.set({ ...engineScope(scope, context), key, value: str });
      state.overlay.set(key, str);
      state.changes.push({ action: 'set', scope, key, value: str });
    },
    get: (key: string): string | undefined => state.overlay.get(key),
    has: (key: string): boolean => state.overlay.has(key),
    unset: (key: string): void => {
      const { scope: s, scopeId } = engineScope(scope, context);
      variables.delete(s, key, scopeId);
      state.overlay.delete(key);
      state.changes.push({ action: 'unset', scope, key });
    },
  });

  const pmShared = {
    environment: makeScopeApi('environment'),
    globals: makeScopeApi('global'),
    collectionVariables: makeScopeApi('collection'),
    variables: {
      get: (key: string): string | undefined => state.overlay.get(key),
      set: (key: string, value: unknown): void => makeScopeApi('local').set(key, value),
      has: (key: string): boolean => state.overlay.has(key),
    },
    expect: makeExpect,
    test: (name: string, fn: () => void): void => {
      try {
        fn();
        state.tests.push({ name, passed: true });
      } catch (error) {
        state.tests.push({ name, passed: false, error: (error as Error).message });
      }
    },
  };

  return { state, log, pmShared };
}

function execute(code: string, sandbox: object, state: ScriptState, timeoutMs: number): ScriptRunResult {
  try {
    vm.runInContext(code, vm.createContext(sandbox), { timeout: timeoutMs });
    return { logs: state.logs, tests: state.tests, variables: state.changes };
  } catch (error) {
    return { logs: state.logs, tests: state.tests, variables: state.changes, error: (error as Error).message };
  }
}

function headerGetter(headers: Record<string, string>): (name: string) => string | undefined {
  return (name: string) => {
    const lower = name.toLowerCase();
    return Object.entries(headers).find(([k]) => k.toLowerCase() === lower)?.[1];
  };
}

/**
 * Executes a post-response script in a sandboxed `node:vm` context with a
 * Postman-compatible `pm` API. Variable mutations are applied immediately.
 */
export function runPostResponseScript(deps: RunPostResponseDeps): ScriptRunResult {
  const { code, response, context, variables, timeoutMs = 2000 } = deps;
  const { state, log, pmShared } = buildCore(variables, context);
  const getHeader = headerGetter(response.headers);

  const pm = {
    ...pmShared,
    response: {
      code: response.status,
      status: response.status,
      responseTime: response.timings.totalMs,
      json: () => tryParseJson(response.body),
      text: () => response.body,
      headers: { get: getHeader, has: (n: string) => getHeader(n) !== undefined },
      to: {
        have: {
          status: (c: number): void => {
            if (response.status !== c) throw new Error(`expected status ${c} but got ${response.status}`);
          },
          header: (n: string): void => {
            if (getHeader(n) === undefined) throw new Error(`expected header "${n}"`);
          },
        },
      },
    },
  };

  // `workbench` is the primary namespace; `pm` is kept as an alias for
  // compatibility with pasted Postman scripts.
  return execute(code, { workbench: pm, pm, console: consoleFor(log), JSON }, state, timeoutMs);
}

/**
 * Executes a pre-request script. The script can read the outgoing request via
 * `pm.request` and set variables that the request then resolves before sending.
 */
export function runPreRequestScript(deps: RunPreRequestDeps): ScriptRunResult {
  const { code, request, context, variables, timeoutMs = 2000 } = deps;
  const { state, log, pmShared } = buildCore(variables, context);
  const getHeader = headerGetter(request.headers);

  const pm = {
    ...pmShared,
    request: {
      method: request.method,
      url: request.url,
      headers: { get: getHeader, has: (n: string) => getHeader(n) !== undefined },
    },
  };

  // `workbench` is the primary namespace; `pm` is kept as an alias for
  // compatibility with pasted Postman scripts.
  return execute(code, { workbench: pm, pm, console: consoleFor(log), JSON }, state, timeoutMs);
}

function consoleFor(log: (...args: unknown[]) => void): Console {
  return { log, info: log, warn: log, error: log, debug: log } as unknown as Console;
}
