// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { WorkflowGraph } from '@shared/workflow';
import { ERROR_HANDLE, findStart, resolveTarget, validateGraph } from '../workflow-graph';
import { WorkflowError } from '../errors';

const pos = { x: 0, y: 0 };

function graph(partial: Partial<WorkflowGraph>): WorkflowGraph {
  return { nodes: partial.nodes ?? [], edges: partial.edges ?? [], groups: partial.groups ?? [] };
}

describe('workflow-graph', () => {
  it('accepts a valid linear graph and resolves the next node', () => {
    const g = graph({
      nodes: [
        { id: 's', kind: 'start', name: 'Start', position: pos, config: {} },
        { id: 'e', kind: 'end', name: 'End', position: pos, config: {} },
      ],
      edges: [{ id: 'e1', source: 's', target: 'e' }],
    });
    const index = validateGraph(g);
    expect(findStart(g).id).toBe('s');
    expect(resolveTarget(index, 's', null)).toBe('e');
    expect(resolveTarget(index, 'e', null)).toBeUndefined();
  });

  it('rejects no start / multiple starts / duplicate ids / unknown edges', () => {
    expect(() => validateGraph(graph({ nodes: [{ id: 'e', kind: 'end', name: 'E', position: pos, config: {} }] }))).toThrow(/no start/i);
    expect(() =>
      validateGraph(
        graph({
          nodes: [
            { id: 's1', kind: 'start', name: 'A', position: pos, config: {} },
            { id: 's2', kind: 'start', name: 'B', position: pos, config: {} },
          ],
        }),
      ),
    ).toThrow(/more than one start/i);
    expect(() =>
      validateGraph(
        graph({
          nodes: [
            { id: 's', kind: 'start', name: 'A', position: pos, config: {} },
            { id: 's', kind: 'end', name: 'B', position: pos, config: {} },
          ],
        }),
      ),
    ).toThrow(/duplicate/i);
    expect(() =>
      validateGraph(
        graph({
          nodes: [{ id: 's', kind: 'start', name: 'A', position: pos, config: {} }],
          edges: [{ id: 'x', source: 's', target: 'ghost' }],
        }),
      ),
    ).toThrow(WorkflowError);
  });

  it('rejects branching from a non-branch node but allows it from a branch node', () => {
    const fromRequest = graph({
      nodes: [
        { id: 's', kind: 'start', name: 'S', position: pos, config: {} },
        { id: 'r', kind: 'request', name: 'R', position: pos, config: { method: 'GET', url: '', headers: {}, query: {}, body: { type: 'none' }, extract: [] } },
        { id: 'a', kind: 'end', name: 'A', position: pos, config: {} },
        { id: 'b', kind: 'end', name: 'B', position: pos, config: {} },
      ],
      edges: [
        { id: 'e0', source: 's', target: 'r' },
        { id: 'e1', source: 'r', target: 'a' },
        { id: 'e2', source: 'r', target: 'b' },
      ],
    });
    expect(() => validateGraph(fromRequest)).toThrow(/only condition\/switch\/loop/i);

    const fromCondition = graph({
      nodes: [
        { id: 's', kind: 'start', name: 'S', position: pos, config: {} },
        { id: 'c', kind: 'condition', name: 'C', position: pos, config: { expression: '{{x}}' } },
        { id: 't', kind: 'end', name: 'T', position: pos, config: {} },
        { id: 'f', kind: 'end', name: 'F', position: pos, config: {} },
      ],
      edges: [
        { id: 'e0', source: 's', target: 'c' },
        { id: 'e1', source: 'c', target: 't', sourceHandle: 'true' },
        { id: 'e2', source: 'c', target: 'f', sourceHandle: 'false' },
      ],
    });
    const index = validateGraph(fromCondition);
    expect(resolveTarget(index, 'c', 'true')).toBe('t');
    expect(resolveTarget(index, 'c', 'false')).toBe('f');
    expect(resolveTarget(index, 'c', 'missing')).toBeUndefined();
  });

  it('allows an error edge alongside a normal edge and skips it for the default path', () => {
    const g = graph({
      nodes: [
        { id: 's', kind: 'start', name: 'S', position: pos, config: {} },
        { id: 'r', kind: 'request', name: 'R', position: pos, config: { method: 'GET', url: '', headers: {}, query: {}, body: { type: 'none' }, extract: [] } },
        { id: 'n', kind: 'end', name: 'N', position: pos, config: {} },
        { id: 'x', kind: 'end', name: 'X', position: pos, config: {} },
      ],
      edges: [
        { id: 'e0', source: 's', target: 'r' },
        { id: 'e1', source: 'r', target: 'n' },
        { id: 'e2', source: 'r', target: 'x', sourceHandle: ERROR_HANDLE },
      ],
    });
    const index = validateGraph(g);
    expect(resolveTarget(index, 'r', null)).toBe('n');
    expect(resolveTarget(index, 'r', ERROR_HANDLE)).toBe('x');
  });

  it('allows cycles (loop back-edges)', () => {
    const g = graph({
      nodes: [
        { id: 's', kind: 'start', name: 'S', position: pos, config: {} },
        { id: 'l', kind: 'loop', name: 'L', position: pos, config: { mode: 'times', times: 2 } },
        { id: 'b', kind: 'delay', name: 'B', position: pos, config: { ms: 0 } },
        { id: 'e', kind: 'end', name: 'E', position: pos, config: {} },
      ],
      edges: [
        { id: 'e0', source: 's', target: 'l' },
        { id: 'e1', source: 'l', target: 'b', sourceHandle: 'body' },
        { id: 'e2', source: 'b', target: 'l' },
        { id: 'e3', source: 'l', target: 'e', sourceHandle: 'done' },
      ],
    });
    expect(() => validateGraph(g)).not.toThrow();
  });
});
