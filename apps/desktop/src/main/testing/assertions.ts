import type { ExecutionResponse } from '@shared/execution';
import type { Assertion, AssertionResult, Comparator } from '@shared/testing';

/** JSONPath-lite: resolves `$.a.b[0].c` against a parsed value. */
export function jsonPath(root: unknown, path: string): unknown {
  if (!path || path === '$') return root;
  const tokens = path.replace(/^\$\.?/, '').match(/[^.[\]]+/g) ?? [];
  let current: unknown = root;
  for (const token of tokens) {
    if (current == null || typeof current !== 'object') return undefined;
    const key = /^\d+$/.test(token) ? Number(token) : token;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function compare(comparator: Comparator, actual: unknown, expected?: string | number): boolean {
  const a = actual;
  switch (comparator) {
    case 'exists':
      return a !== undefined && a !== null;
    case 'equals':
      return String(a) === String(expected);
    case 'notEquals':
      return String(a) !== String(expected);
    case 'contains':
      return String(a).includes(String(expected));
    case 'matches':
      return new RegExp(String(expected)).test(String(a));
    case 'lt':
      return Number(a) < Number(expected);
    case 'lte':
      return Number(a) <= Number(expected);
    case 'gt':
      return Number(a) > Number(expected);
    case 'gte':
      return Number(a) >= Number(expected);
    default:
      return false;
  }
}

function result(name: string, type: string, passed: boolean, message: string): AssertionResult {
  return { name, type, passed, message };
}

/** Evaluates the non-schema, non-script assertions (status/header/body/time). */
export function evaluateSimple(
  assertion: Extract<Assertion, { type: 'status' | 'header' | 'body' | 'responseTime' }>,
  response: ExecutionResponse,
): AssertionResult {
  switch (assertion.type) {
    case 'status': {
      const name = assertion.name ?? 'Status';
      if (Array.isArray(assertion.value)) {
        const passed = assertion.value.includes(response.status);
        return result(name, 'status', passed, `status ${response.status} in [${assertion.value.join(', ')}]`);
      }
      const passed = compare(assertion.comparator, response.status, assertion.value);
      return result(name, 'status', passed, `status ${response.status} ${assertion.comparator} ${assertion.value}`);
    }
    case 'header': {
      const name = assertion.name ?? `Header ${assertion.header}`;
      const actual = response.headers[assertion.header.toLowerCase()];
      const passed = compare(assertion.comparator, actual, assertion.value);
      return result(name, 'header', passed, `header "${assertion.header}" = ${actual ?? '(absent)'}`);
    }
    case 'body': {
      const name = assertion.name ?? `Body ${assertion.path}`;
      const data = tryParseJson(response.body);
      const actual = jsonPath(data ?? response.body, assertion.path);
      const passed = compare(assertion.comparator, actual, assertion.value);
      return result(name, 'body', passed, `${assertion.path} = ${JSON.stringify(actual)}`);
    }
    case 'responseTime': {
      const name = assertion.name ?? 'Response time';
      const passed = compare(assertion.comparator, response.timings.totalMs, assertion.value);
      return result(name, 'responseTime', passed, `${response.timings.totalMs}ms ${assertion.comparator} ${assertion.value}ms`);
    }
    default:
      return result('unknown', 'unknown', false, 'Unsupported assertion');
  }
}
