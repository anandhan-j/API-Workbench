// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { NodeEncryptor } from '../../variables/node-encryptor';
import { CollectionExplorer } from '../../collections';
import { VariableService } from '../../variables';
import { WorkflowService, BUILTIN_NODE_EXECUTORS } from '../../workflows';
import { NodeExecutorRegistry } from '../../plugins';
import { createReadOnlyTools, createWriteTools, type AiTool, type AiToolDeps } from '../tools';

/** A minimal, valid start → end workflow export bundle. */
const TINY_BUNDLE = {
  formatVersion: 1 as const,
  exportedAt: 0,
  rootId: 'wf1',
  workflows: [
    {
      id: 'wf1',
      name: 'Tiny',
      description: null,
      graph: {
        nodes: [
          { id: 'start', name: 'Start', position: { x: 0, y: 0 }, kind: 'start', config: {} },
          { id: 'end', name: 'End', position: { x: 200, y: 0 }, kind: 'end', config: {} },
        ],
        edges: [{ id: 'e1', source: 'start', target: 'end' }],
        groups: [],
      },
    },
  ],
};

async function makeTools(): Promise<{ tools: Map<string, AiTool>; projectId: string; deps: AiToolDeps }> {
  const connection = await createSqlJsConnection();
  const persistence = new PersistenceService(connection, { backupDir: '/tmp/awb-test-wf-tools' });
  const workspace = persistence.workspaces.create({ name: 'W', settings: {} });
  const project = persistence.projects.create({ workspaceId: workspace.id, name: 'P' });

  const workflows = new WorkflowService(persistence, {
    executeRequest: async () => {
      throw new Error('no request nodes in these tests');
    },
    evaluate: (template) => template,
    appVersion: '0.0.0',
    nodeExecutors: new NodeExecutorRegistry(BUILTIN_NODE_EXECUTORS),
  });

  const deps: AiToolDeps = {
    collections: new CollectionExplorer(persistence),
    variables: new VariableService(persistence, new NodeEncryptor()),
    workflows,
    activeSelection: () => ({ workspaceId: workspace.id, projectId: project.id }),
  };

  const all = [...createReadOnlyTools(deps), ...createWriteTools(deps)];
  return { tools: new Map(all.map((t) => [t.def.name, t])), projectId: project.id, deps };
}

describe('workflow tools', () => {
  let tools: Map<string, AiTool>;
  let projectId: string;
  let deps: AiToolDeps;
  beforeEach(async () => {
    ({ tools, projectId, deps } = await makeTools());
  });

  it('exposes the authoring guide via get_workflow_schema (read tier)', async () => {
    const tool = tools.get('get_workflow_schema')!;
    expect(tool.tier).toBe('read');
    const { result } = await tool.run({});
    expect(result).toHaveProperty('kinds');
    expect((result as { kinds: Record<string, unknown> }).kinds).toHaveProperty('request');
  });

  it('validate_workflow accepts a valid bundle and reports problems on an invalid one', async () => {
    const validate = tools.get('validate_workflow')!;
    const good = await validate.run({ workflow: TINY_BUNDLE });
    expect(good.result).toMatchObject({ valid: true, errors: [] });

    const bad = await validate.run({ workflow: { formatVersion: 1, workflows: 'nope' } });
    expect((bad.result as { valid: boolean }).valid).toBe(false);
    expect((bad.result as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
  });

  it('create_workflow is a write tool that imports into the active project', async () => {
    const create = tools.get('create_workflow')!;
    expect(create.tier).toBe('write');
    expect(create.describe?.({ workflow: TINY_BUNDLE })).toMatch(/Tiny/);

    const { result } = await create.run({ workflow: TINY_BUNDLE });
    const created = result as { id: string; name: string };
    expect(created.name).toBe('Tiny');
    expect(deps.workflows.list(projectId).map((w) => w.id)).toContain(created.id);
  });

  it('run_workflow is an execute tool and returns status without leaking variable values', async () => {
    const created = (await tools.get('create_workflow')!.run({ workflow: TINY_BUNDLE })).result as {
      id: string;
    };
    const run = tools.get('run_workflow')!;
    expect(run.tier).toBe('execute');

    const { result } = await run.run({ workflowId: created.id });
    const outcome = result as {
      status: string;
      nodeResults: Array<{ nodeId: string; status: string }>;
      producedVariableKeys: string[];
    };
    expect(outcome.status).toBe('success');
    expect(outcome.nodeResults.length).toBeGreaterThan(0);
    // Only variable KEYS are returned, never values.
    expect(outcome).not.toHaveProperty('finalVariables');
    expect(Array.isArray(outcome.producedVariableKeys)).toBe(true);
  });
});
