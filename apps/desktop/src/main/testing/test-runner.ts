import { httpViewOf, type HttpView, type ProtocolResponse } from '@shared/protocol';
import type { Assertion, AssertionResult, TestReport } from '@shared/testing';
import { evaluateSimple, tryParseJson } from './assertions';
import { validateJsonSchema } from './schema-validator';
import { runScript } from './script-runner';

/**
 * Runs a set of assertions against a protocol response and produces a report.
 * Assertions see the flat HTTP-flavoured view (real HTTP fields for `'http'`,
 * summary/metadata degradation for other types). Each assertion is isolated: a
 * thrown error in one becomes a failed result, not a crash, so a report always
 * covers every assertion.
 */
export class TestRunner {
  run(response: ProtocolResponse, assertions: Assertion[]): TestReport {
    const t0 = Date.now();
    const view = httpViewOf(response);
    const results = assertions.map((a) => this.evaluate(a, view));
    const passed = results.filter((r) => r.passed).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      durationMs: Math.max(0, Date.now() - t0),
      results,
    };
  }

  private evaluate(assertion: Assertion, response: HttpView): AssertionResult {
    try {
      switch (assertion.type) {
        case 'status':
        case 'header':
        case 'body':
        case 'responseTime':
          return evaluateSimple(assertion, response);
        case 'jsonSchema': {
          const data = tryParseJson(response.body);
          const { valid, errors } = validateJsonSchema(assertion.schema, data);
          return {
            name: assertion.name ?? 'JSON Schema',
            type: 'jsonSchema',
            passed: valid,
            message: valid ? 'Schema valid' : errors.join('; ') || 'Schema invalid',
          };
        }
        case 'script': {
          const r = runScript(assertion.code, response);
          return { name: assertion.name ?? 'Script', type: 'script', passed: r.passed, message: r.message };
        }
        default:
          return { name: 'unknown', type: 'unknown', passed: false, message: 'Unsupported assertion' };
      }
    } catch (error) {
      return {
        name: assertion.name ?? assertion.type,
        type: assertion.type,
        passed: false,
        message: (error as Error).message,
      };
    }
  }
}
