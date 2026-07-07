import { describe, expect, it } from 'vitest';

import { buildOverwriteMessage, formatSummary, summarizeWorkflow } from './persist.js';

const bundle = {
  formatVersion: 1,
  exportedAt: 0,
  rootId: 'wf-main',
  workflows: [
    {
      id: 'wf-main',
      name: 'Create post',
      description: null,
      graph: {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [{ id: 'e1' }, { id: 'e2' }],
        groups: [],
      },
    },
    { id: 'wf-sub', name: 'Sub', description: null, graph: { nodes: [{ id: 'x' }], edges: [], groups: [] } },
  ],
};

describe('summarizeWorkflow', () => {
  it('summarises the root workflow and counts', () => {
    expect(summarizeWorkflow(bundle)).toEqual({
      name: 'Create post',
      rootId: 'wf-main',
      workflowCount: 2,
      nodeCount: 3,
      edgeCount: 2,
    });
  });

  it('picks the workflow matching rootId, not just the first', () => {
    const reordered = { ...bundle, rootId: 'wf-sub' };
    expect(summarizeWorkflow(reordered).name).toBe('Sub');
    expect(summarizeWorkflow(reordered).nodeCount).toBe(1);
  });

  it('degrades gracefully on a malformed object', () => {
    expect(summarizeWorkflow({})).toEqual({
      name: '(unnamed)',
      rootId: '',
      workflowCount: 0,
      nodeCount: 0,
      edgeCount: 0,
    });
    expect(summarizeWorkflow(null).workflowCount).toBe(0);
  });
});

describe('formatSummary', () => {
  it('renders a one-liner with pluralisation and sub-workflow count', () => {
    expect(formatSummary(summarizeWorkflow(bundle))).toBe(
      '"Create post" [wf-main] — 3 nodes, 2 edges (+1 sub-workflow)',
    );
  });

  it('handles singular node/edge and no sub-workflows', () => {
    const one = { rootId: 'x', workflows: [{ id: 'x', name: 'One', graph: { nodes: [{}], edges: [{}], groups: [] } }] };
    expect(formatSummary(summarizeWorkflow(one))).toBe('"One" [x] — 1 node, 1 edge');
  });
});

describe('buildOverwriteMessage', () => {
  it('names the file and shows before → after', () => {
    const msg = buildOverwriteMessage('/tmp/x.workflow.json', summarizeWorkflow(bundle), summarizeWorkflow(bundle));
    expect(msg).toContain('/tmp/x.workflow.json');
    expect(msg).toContain('Replacing: "Create post"');
    expect(msg).toContain('With:      "Create post"');
    expect(msg).toContain('Overwrite the existing workflow?');
  });

  it('notes when the existing file could not be read', () => {
    const msg = buildOverwriteMessage('/tmp/x.workflow.json', null, summarizeWorkflow(bundle));
    expect(msg).toContain('could not read the existing file');
  });
});
