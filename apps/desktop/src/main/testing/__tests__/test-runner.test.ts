// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExecutionResponse } from '@shared/execution';
import type { Assertion } from '@shared/testing';
import { TestRunner } from '../test-runner';

function res(over: Partial<ExecutionResponse> = {}): ExecutionResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json', 'x-rate-limit': '99' },
    body: JSON.stringify({ data: { items: [{ id: 7, name: 'a' }] }, count: 1 }),
    bodyKind: 'json',
    contentType: 'application/json',
    sizeBytes: 50,
    timings: { startedAt: 0, totalMs: 120 },
    redirects: [],
    retries: 0,
    ...over,
  };
}

const runner = new TestRunner();

describe('TestRunner', () => {
  it('checks status (equals and membership)', () => {
    const report = runner.run(res(), [
      { type: 'status', comparator: 'equals', value: 200 },
      { type: 'status', comparator: 'equals', value: [200, 201, 204] },
      { type: 'status', comparator: 'equals', value: 404 },
    ] as Assertion[]);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[1].passed).toBe(true);
    expect(report.results[2].passed).toBe(false);
  });

  it('checks headers and response time', () => {
    const report = runner.run(res(), [
      { type: 'header', header: 'X-Rate-Limit', comparator: 'equals', value: '99' },
      { type: 'header', header: 'X-Missing', comparator: 'exists' },
      { type: 'responseTime', comparator: 'lt', value: 500 },
    ] as Assertion[]);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[1].passed).toBe(false);
    expect(report.results[2].passed).toBe(true);
  });

  it('checks body values via JSONPath', () => {
    const report = runner.run(res(), [
      { type: 'body', path: '$.data.items[0].id', comparator: 'equals', value: '7' },
      { type: 'body', path: '$.data.items[0].name', comparator: 'contains', value: 'a' },
      { type: 'body', path: '$.count', comparator: 'gt', value: '0' },
      { type: 'body', path: '$.missing', comparator: 'exists' },
    ] as Assertion[]);
    expect(report.results.map((r) => r.passed)).toEqual([true, true, true, false]);
  });

  it('validates against a JSON Schema', () => {
    const schema = {
      type: 'object',
      required: ['count'],
      properties: { count: { type: 'number' } },
    };
    const good = runner.run(res(), [{ type: 'jsonSchema', schema }] as Assertion[]);
    expect(good.results[0].passed).toBe(true);

    const bad = runner.run(res({ body: JSON.stringify({ count: 'not-a-number' }) }), [
      { type: 'jsonSchema', schema },
    ] as Assertion[]);
    expect(bad.results[0].passed).toBe(false);
  });

  it('runs custom scripts with assert + response', () => {
    const report = runner.run(res(), [
      { type: 'script', name: 'ok', code: 'assert(response.status === 200, "want 200")' },
      { type: 'script', name: 'json', code: 'assert(response.json.count === 1)' },
      { type: 'script', name: 'fail', code: 'assert(false, "nope")' },
    ] as Assertion[]);
    expect(report.results[0].passed).toBe(true);
    expect(report.results[1].passed).toBe(true);
    expect(report.results[2].passed).toBe(false);
    expect(report.results[2].message).toContain('nope');
  });

  it('summarizes pass/fail counts', () => {
    const report = runner.run(res(), [
      { type: 'status', comparator: 'equals', value: 200 },
      { type: 'status', comparator: 'equals', value: 500 },
    ] as Assertion[]);
    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });
});
