import { z } from 'zod';

/**
 * A high-level, model-friendly spec for a *linear* workflow that `generate_workflow`
 * lowers into a canonical `.workflow.json` bundle: it inserts start/end nodes,
 * generates ids, auto-positions nodes on a row, wraps request config in the
 * protocol envelope, and fills defaults. Branching/looping workflows are better
 * authored directly and checked with `validate_workflow`.
 */

const authSpec = z
  .discriminatedUnion('scheme', [
    z.object({ scheme: z.literal('none') }),
    z.object({ scheme: z.literal('bearer'), token: z.string() }),
    z.object({ scheme: z.literal('basic'), username: z.string(), password: z.string() }),
    z.object({
      scheme: z.literal('apiKey'),
      key: z.string(),
      value: z.string(),
      in: z.enum(['header', 'query']).default('header'),
    }),
  ])
  .describe('Request authentication. Values may contain {{variables}}.');

const extractSpec = z.object({
  variable: z.string().describe('Runtime variable to store the extracted value in.'),
  source: z.enum(['body', 'header', 'status']).default('body'),
  engine: z.enum(['jsonpath', 'jmespath', 'regex']).default('jsonpath'),
  expression: z.string().default(''),
});

const requestStep = z.object({
  type: z.literal('request'),
  name: z.string().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).default('GET'),
  url: z.string().describe('Request URL; may contain {{variables}}.'),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  body: z.string().optional().describe('Raw request body (e.g. a JSON string).'),
  bodyType: z.enum(['json', 'text', 'xml']).default('json'),
  auth: authSpec.optional(),
  extract: z.array(extractSpec).default([]),
});

const setVariableStep = z.object({
  type: z.literal('set-variable'),
  name: z.string().optional(),
  key: z.string(),
  value: z.string(),
  scope: z.enum(['runtime', 'workspace', 'global']).default('runtime'),
});

const delayStep = z.object({
  type: z.literal('delay'),
  name: z.string().optional(),
  ms: z.number().int().min(0).max(600_000),
});

const transformStep = z.object({
  type: z.literal('transform'),
  name: z.string().optional(),
  variable: z.string(),
  engine: z.enum(['template', 'jsonpath', 'jmespath', 'regex']).default('template'),
  input: z.string().default(''),
  expression: z.string().default(''),
});

const userInputFieldSpec = z.object({
  kind: z.enum(['string', 'secret', 'number', 'boolean', 'select', 'keyvalue']).default('string'),
  label: z.string().default(''),
  variable: z.string(),
  default: z.string().default(''),
  options: z.array(z.string()).default([]),
  required: z.boolean().default(false),
});

const userInputStep = z.object({
  type: z.literal('user-input'),
  name: z.string().optional(),
  message: z.string().default(''),
  fields: z.array(userInputFieldSpec).default([]),
});

export const workflowStep = z.discriminatedUnion('type', [
  requestStep,
  setVariableStep,
  delayStep,
  transformStep,
  userInputStep,
]);
export type WorkflowStep = z.infer<typeof workflowStep>;

/** Raw shape passed to `registerTool` as the `generate_workflow` inputSchema. */
export const generateSpecShape = {
  name: z.string().describe('The workflow name.'),
  description: z.string().optional().describe('A short description of what the workflow does.'),
  steps: z
    .array(workflowStep)
    .min(1)
    .describe('Ordered steps, wired linearly: start → step 1 → … → step N → end.'),
};

const generateSpec = z.object(generateSpecShape);
export type GenerateSpec = z.infer<typeof generateSpec>;

function slug(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'workflow';
}

function lowerAuth(auth: z.infer<typeof authSpec>): Record<string, unknown> {
  switch (auth.scheme) {
    case 'none':
      return { type: 'none' };
    case 'bearer':
      return { type: 'bearer', token: auth.token };
    case 'basic':
      return { type: 'basic', username: auth.username, password: auth.password };
    case 'apiKey':
      return { type: 'apiKey', key: auth.key, value: auth.value, in: auth.in };
  }
}

function defaultName(step: WorkflowStep): string {
  switch (step.type) {
    case 'request':
      return `${step.method} ${step.url}`;
    case 'set-variable':
      return `Set ${step.key}`;
    case 'delay':
      return `Wait ${step.ms}ms`;
    case 'transform':
      return `Transform ${step.variable}`;
    case 'user-input':
      return 'User input';
  }
}

function lowerConfig(step: WorkflowStep): Record<string, unknown> {
  switch (step.type) {
    case 'request': {
      const payload: Record<string, unknown> = { method: step.method, url: step.url };
      if (step.headers) payload.headers = step.headers;
      if (step.query) payload.query = step.query;
      if (step.body !== undefined) payload.body = { type: step.bodyType, content: step.body };
      const config: Record<string, unknown> = { type: 'http', payload, extract: step.extract };
      if (step.auth) config.auth = lowerAuth(step.auth);
      return config;
    }
    case 'set-variable':
      return { key: step.key, value: step.value, scope: step.scope };
    case 'delay':
      return { ms: step.ms };
    case 'transform':
      return {
        variable: step.variable,
        engine: step.engine,
        input: step.input,
        expression: step.expression,
      };
    case 'user-input':
      return {
        message: step.message,
        fields: step.fields.map((f) => ({
          kind: f.kind,
          label: f.label,
          variable: f.variable,
          default: f.default,
          options: f.options,
          entries: {},
          filledAtRuntime: false,
          required: f.required,
        })),
      };
  }
}

export interface AssembleOptions {
  /** Epoch ms stamped into `exportedAt`. Passed explicitly for reproducibility. */
  now?: number;
}

/** Lowers a spec into a canonical `WorkflowExport` bundle (unvalidated). */
export function assembleWorkflow(spec: GenerateSpec, options: AssembleOptions = {}): Record<string, unknown> {
  const workflowId = slug(spec.name);
  const y = 220;
  const dx = 240;
  let x = 80;

  const nodes: Record<string, unknown>[] = [
    { id: 'start', kind: 'start', name: 'Start', position: { x, y }, config: {} },
  ];
  const edges: Record<string, unknown>[] = [];

  let prev = 'start';
  spec.steps.forEach((step, index) => {
    x += dx;
    const id = `step-${index + 1}`;
    nodes.push({
      id,
      kind: step.type,
      name: step.name ?? defaultName(step),
      position: { x, y },
      config: lowerConfig(step),
    });
    edges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
    prev = id;
  });

  x += dx;
  nodes.push({ id: 'end', kind: 'end', name: 'End', position: { x, y }, config: { outcome: 'success' } });
  edges.push({ id: `e-${prev}-end`, source: prev, target: 'end' });

  return {
    formatVersion: 1,
    exportedAt: options.now ?? 0,
    rootId: workflowId,
    workflows: [
      {
        id: workflowId,
        name: spec.name,
        description: spec.description ?? null,
        graph: { nodes, edges, groups: [] },
      },
    ],
  };
}
