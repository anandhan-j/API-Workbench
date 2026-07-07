import { describe, expect, it } from 'vitest';

import { assembleWorkflow, type GenerateSpec } from './generate.js';
import { validateWorkflow } from './validate.js';

const spec: GenerateSpec = {
  name: 'Login and fetch profile',
  description: 'Prompt for a token, call login, extract a user id, fetch the profile.',
  steps: [
    {
      type: 'user-input',
      message: 'Enter your API token',
      fields: [
        { kind: 'secret', label: 'Token', variable: 'token', default: '', options: [], required: true },
      ],
    },
    {
      type: 'set-variable',
      key: 'baseUrl',
      value: 'https://api.example.com',
      scope: 'runtime',
    },
    {
      type: 'request',
      method: 'POST',
      url: '{{baseUrl}}/login',
      headers: { 'Content-Type': 'application/json' },
      query: {},
      body: '{"grant":"token"}',
      bodyType: 'json',
      auth: { scheme: 'bearer', token: '{{token}}' },
      extract: [{ variable: 'userId', source: 'body', engine: 'jsonpath', expression: '$.id' }],
    },
    {
      type: 'request',
      method: 'GET',
      url: '{{baseUrl}}/users/{{userId}}',
      extract: [],
    },
  ],
};

describe('assembleWorkflow', () => {
  it('produces a valid, canonical workflow bundle', () => {
    const bundle = assembleWorkflow(spec, { now: 1_700_000_000_000 });
    const result = validateWorkflow(bundle, 'export');
    expect(result.valid, JSON.stringify(result.errors, null, 2)).toBe(true);
  });

  it('inserts start/end and wires steps linearly', () => {
    const bundle: any = assembleWorkflow(spec, { now: 0 });
    const graph = bundle.workflows[0].graph;
    expect(graph.nodes[0].kind).toBe('start');
    expect(graph.nodes[graph.nodes.length - 1].kind).toBe('end');
    // start + 4 steps + end
    expect(graph.nodes).toHaveLength(6);
    // one edge fewer than nodes (a single chain)
    expect(graph.edges).toHaveLength(5);
    // each edge connects consecutive nodes
    for (let i = 0; i < graph.edges.length; i += 1) {
      expect(graph.edges[i].source).toBe(graph.nodes[i].id);
      expect(graph.edges[i].target).toBe(graph.nodes[i + 1].id);
    }
  });

  it('is deterministic for the same spec + now', () => {
    const a = assembleWorkflow(spec, { now: 42 });
    const b = assembleWorkflow(spec, { now: 42 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('lowers a request into the protocol envelope', () => {
    const bundle: any = assembleWorkflow(spec, { now: 0 });
    const req = bundle.workflows[0].graph.nodes.find((n: any) => n.kind === 'request');
    expect(req.config.type).toBe('http');
    expect(req.config.payload.method).toBe('POST');
    expect(req.config.payload.body).toEqual({ type: 'json', content: '{"grant":"token"}' });
    expect(req.config.auth).toEqual({ type: 'bearer', token: '{{token}}' });
  });

  it('derives a slug rootId from the name', () => {
    const bundle: any = assembleWorkflow(spec, { now: 0 });
    expect(bundle.rootId).toBe('login-and-fetch-profile');
    expect(bundle.workflows[0].id).toBe('login-and-fetch-profile');
  });
});
