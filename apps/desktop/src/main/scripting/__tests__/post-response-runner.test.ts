// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExecutionResponse } from '@shared/execution';
import type { VariableContext, VariableScope } from '@shared/variable';
import { runPostResponseScript, runPreRequestScript, type VariableBackend } from '../post-response-runner';

function makeResponse(body: string, status = 200): ExecutionResponse {
  return {
    ok: status < 400,
    status,
    statusText: 'OK',
    headers: { 'content-type': 'application/json', 'x-trace': 'abc' },
    body,
    bodyKind: 'json',
    contentType: 'application/json',
    sizeBytes: body.length,
    timings: { startedAt: 0, totalMs: 42 },
    redirects: [],
    retries: 0,
  };
}

function makeBackend(seed: Record<string, string> = {}): VariableBackend & {
  sets: { scope: VariableScope; scopeId?: string; key: string; value: string }[];
  deletes: { scope: VariableScope; key: string; scopeId?: string }[];
} {
  const sets: { scope: VariableScope; scopeId?: string; key: string; value: string }[] = [];
  const deletes: { scope: VariableScope; key: string; scopeId?: string }[] = [];
  return {
    sets,
    deletes,
    set: (i) => sets.push(i),
    delete: (scope, key, scopeId) => deletes.push({ scope, key, scopeId }),
    resolve: () => new Map(Object.entries(seed).map(([k, v]) => [k, { value: v }])),
  };
}

const ctx: VariableContext = { workspaceId: 'ws1', collectionId: 'col1', requestId: 'req1' };

describe('runPostResponseScript', () => {
  it('reads the response and writes variables to the mapped scopes', () => {
    const backend = makeBackend();
    const result = runPostResponseScript({
      code: `
        const data = pm.response.json();
        pm.environment.set("token", data.token);
        pm.collectionVariables.set("id", data.id);
        pm.globals.set("status", pm.response.code);
      `,
      response: makeResponse('{"token":"T","id":7}'),
      context: ctx,
      variables: backend,
    });

    expect(result.error).toBeUndefined();
    expect(backend.sets).toEqual([
      { scope: 'workspace', scopeId: 'ws1', key: 'token', value: 'T' },
      { scope: 'collection', scopeId: 'col1', key: 'id', value: '7' },
      { scope: 'global', key: 'status', value: '200' },
    ]);
    expect(result.variables.map((v) => v.scope)).toEqual(['environment', 'collection', 'global']);
  });

  it('records pm.test results and supports pm.expect / pm.response.to.have.status', () => {
    const result = runPostResponseScript({
      code: `
        pm.test("status ok", () => pm.response.to.have.status(200));
        pm.test("has token", () => pm.expect(pm.response.json().token).to.equal("T"));
        pm.test("fails", () => pm.expect(1).to.equal(2));
      `,
      response: makeResponse('{"token":"T"}'),
      context: ctx,
      variables: makeBackend(),
    });
    expect(result.tests).toEqual([
      { name: 'status ok', passed: true },
      { name: 'has token', passed: true },
      { name: 'fails', passed: false, error: expect.stringContaining('to equal') },
    ]);
  });

  it('exposes header lookups, console logs, and resolved variables', () => {
    const backend = makeBackend({ existing: 'seeded' });
    const result = runPostResponseScript({
      code: `
        console.log("trace", pm.response.headers.get("X-Trace"));
        console.log("existing=" + pm.variables.get("existing"));
      `,
      response: makeResponse('{}'),
      context: ctx,
      variables: backend,
    });
    expect(result.logs).toEqual(['trace abc', 'existing=seeded']);
  });

  it('exposes the API under the workbench namespace (pm is an alias)', () => {
    const backend = makeBackend();
    const result = runPostResponseScript({
      code: `workbench.environment.set("a", "1"); pm.globals.set("b", "2");`,
      response: makeResponse('{}'),
      context: ctx,
      variables: backend,
    });
    expect(result.error).toBeUndefined();
    expect(backend.sets).toEqual([
      { scope: 'workspace', scopeId: 'ws1', key: 'a', value: '1' },
      { scope: 'global', key: 'b', value: '2' },
    ]);
  });

  it('captures a top-level script error', () => {
    const result = runPostResponseScript({
      code: `throw new Error("boom");`,
      response: makeResponse('{}'),
      context: ctx,
      variables: makeBackend(),
    });
    expect(result.error).toContain('boom');
  });

  it('unsets a variable', () => {
    const backend = makeBackend({ token: 'x' });
    runPostResponseScript({
      code: `pm.environment.unset("token");`,
      response: makeResponse('{}'),
      context: ctx,
      variables: backend,
    });
    expect(backend.deletes).toEqual([{ scope: 'workspace', key: 'token', scopeId: 'ws1' }]);
  });
});

describe('runPreRequestScript', () => {
  it('sets variables and exposes the outgoing request', () => {
    const backend = makeBackend();
    const result = runPreRequestScript({
      code: `
        pm.environment.set("ts", "123");
        console.log(pm.request.method, pm.request.url, pm.request.headers.get("X-Api"));
      `,
      request: { method: 'POST', url: 'https://api.test/x', headers: { 'X-Api': 'key1' } },
      context: ctx,
      variables: backend,
    });
    expect(result.error).toBeUndefined();
    expect(backend.sets).toEqual([{ scope: 'workspace', scopeId: 'ws1', key: 'ts', value: '123' }]);
    expect(result.logs).toEqual(['POST https://api.test/x key1']);
  });
});
