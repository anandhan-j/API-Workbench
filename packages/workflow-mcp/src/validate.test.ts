import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateWorkflow } from './validate.js';

function example(name: string): Record<string, unknown> {
  const url = new URL(`./examples/${name}.workflow.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
}

/** Deep clone so mutations don't leak between tests. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

describe('validateWorkflow', () => {
  it('accepts every bundled example', () => {
    for (const name of ['hello-world', 'auth-flow', 'full-feature']) {
      const result = validateWorkflow(example(name));
      expect(result.valid, JSON.stringify(result.errors, null, 2)).toBe(true);
    }
  });

  it('reports an unknown node kind as a single clear message', () => {
    const wf = clone(example('hello-world'));
    (wf.workflows as any)[0].graph.nodes[1].kind = 'fetch';
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    // Exactly one error about the bad kind — not one per union arm.
    const kindErrors = result.errors.filter((e) => e.path.endsWith('/kind'));
    expect(kindErrors).toHaveLength(1);
    expect(kindErrors[0]!.message).toContain('must be one of');
    expect(kindErrors[0]!.message).toContain("got \"fetch\"");
    expect(kindErrors[0]!.message).toContain('request');
  });

  it('reports a missing required config field on the matched arm', () => {
    const wf = clone(example('full-feature'));
    const nodes = (wf.workflows as any)[0].graph.nodes;
    const delay = nodes.find((n: any) => n.kind === 'delay');
    delete delay.config.ms;
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    const msgs = result.errors.map((e) => e.message);
    expect(msgs.some((m) => m.includes('/ms') && m.includes('required'))).toBe(true);
    // The delay arm matched, so we should NOT be drowning in other-arm noise.
    expect(result.errors.length).toBeLessThan(5);
  });

  it('reports a wrong-typed config value with the actual value', () => {
    const wf = clone(example('full-feature'));
    const nodes = (wf.workflows as any)[0].graph.nodes;
    const delay = nodes.find((n: any) => n.kind === 'delay');
    delay.config.ms = 'soon';
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    const msg = result.errors.find((e) => e.path.endsWith('/ms'));
    expect(msg).toBeDefined();
    expect(msg!.message).toMatch(/integer|number/);
    expect(msg!.message).toContain('soon');
  });

  it('reports a bad enum on a non-discriminator field', () => {
    const wf = clone(example('full-feature'));
    const nodes = (wf.workflows as any)[0].graph.nodes;
    const setVar = nodes.find((n: any) => n.kind === 'set-variable');
    setVar.config.scope = 'universe';
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    const msg = result.errors.find((e) => e.path.endsWith('/scope'));
    expect(msg).toBeDefined();
    expect(msg!.message).toContain('must be one of');
    expect(msg!.message).toContain('runtime');
  });

  it('reports a nested discriminator (loop mode) cleanly', () => {
    const wf = clone(example('full-feature'));
    const nodes = (wf.workflows as any)[0].graph.nodes;
    const loop = nodes.find((n: any) => n.kind === 'loop');
    loop.config.mode = 'forever';
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    const modeErr = result.errors.find((e) => e.path.endsWith('/mode'));
    expect(modeErr).toBeDefined();
    expect(modeErr!.message).toContain('must be one of');
  });

  it('does not let one bad node corrupt another good node (arm scoping)', () => {
    // node 0 has a valid kind ("start") but an invalid config; node 2 has an
    // invalid kind. The invalid kind must not make node 0 report a bogus
    // "kind must be one of" message — its real config error must survive.
    const wf = clone(example('auth-flow'));
    const nodes = (wf.workflows as any)[0].graph.nodes;
    nodes[0].config = { bogus: true };
    nodes[2].kind = 'htttp';
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);

    const node0 = result.errors.filter((e) => e.path.startsWith('/workflows/0/graph/nodes/0'));
    expect(node0.some((e) => e.message.includes('bogus'))).toBe(true);
    expect(node0.some((e) => e.path.endsWith('/kind'))).toBe(false);

    const node2 = result.errors.filter((e) => e.path === '/workflows/0/graph/nodes/2/kind');
    expect(node2).toHaveLength(1);
    expect(node2[0]!.message).toContain('got "htttp"');
  });

  it('reports a valid-kind node with a bad config field, not a kind error', () => {
    const wf = clone(example('hello-world'));
    (wf.workflows as any)[0].graph.nodes[0].config = { bogus: true };
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('bogus');
    expect(result.errors[0]!.path.endsWith('/kind')).toBe(false);
  });

  it('reports a top-level structural error', () => {
    const wf = clone(example('hello-world'));
    delete (wf as any).rootId;
    const result = validateWorkflow(wf);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('rootId') && e.message.includes('required'))).toBe(
      true,
    );
  });

  it('flags invalid JSON handled by the caller (object input only here)', () => {
    const result = validateWorkflow({ not: 'a workflow' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
