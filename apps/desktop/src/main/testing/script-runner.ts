import vm from 'node:vm';
import type { HttpView } from '@shared/protocol';
import { tryParseJson } from './assertions';

/**
 * Runs a user-authored test script in a sandboxed `node:vm` context. The script
 * receives a read-only `response` (status, headers, body, parsed `json`, ok) and
 * an `assert(condition, message)` helper; throwing (including a failed assert)
 * marks the test failed. A wall-clock timeout guards against runaway scripts.
 */
export function runScript(
  code: string,
  response: HttpView,
): { passed: boolean; message: string } {
  const sandbox = {
    response: {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      body: response.body,
      json: tryParseJson(response.body),
      timings: response.timings,
    },
    assert(condition: unknown, message?: string): void {
      if (!condition) throw new Error(message ?? 'Assertion failed');
    },
    console: { log: () => undefined },
  };
  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(code, context, { timeout: 1000 });
    return { passed: true, message: 'Script passed' };
  } catch (error) {
    return { passed: false, message: (error as Error).message };
  }
}
