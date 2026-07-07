import { z } from 'zod';
import { VariableScope } from '@shared/variable';
import type { ActiveSelection } from '@shared/workspace';
import type { RequestDetailFull, KeyValueEntry, RequestDetails } from '@shared/request-details';
import { emptyDetails } from '@shared/request-details';
import { HttpMethod } from '@shared/collection';
import { WorkflowExport } from '@shared/workflow';
import type { AiDataKind } from '@shared/ai';
import type { CollectionExplorer } from '../collections';
import type { WorkflowService } from '../workflows';
import type { VariableService } from '../variables';
import type { ToolDef } from './providers';

/**
 * Read-only tool registry for the AI assistant (ADR-0012, Phase 1).
 *
 * Each tool calls the same service methods the IPC handlers call, in-process —
 * no round trip through the MCP child. Every tool is a pure lookup: nothing here
 * mutates state or executes a request. Secret material is kept out of the
 * model's context — variable listings arrive already masked from the variable
 * engine, and {@link redactRequest} strips stored auth and sensitive header
 * values before a request definition is returned.
 */

export interface AiToolDeps {
  collections: CollectionExplorer;
  workflows: WorkflowService;
  variables: VariableService;
  activeSelection: () => ActiveSelection;
}

/**
 * `read` tools auto-run. `write` tools require confirmation (batch-approvable per
 * chat). `execute` tools also require confirmation but are never batched — they
 * hit the network or run something (ADR-0012, Phases 2–3).
 */
export type AiToolTier = 'read' | 'write' | 'execute';

export interface AiTool {
  def: ToolDef;
  tier: AiToolTier;
  run(input: Record<string, unknown>): Promise<{ result: unknown; summary: string }>;
  /** One-line description of a write action, shown on the confirmation card. */
  describe?(input: Record<string, unknown>): string;
  /** The collection a write touches, so the agent loop can auto-snapshot it first. */
  snapshotCollectionId?(input: Record<string, unknown>): string | undefined;
  /** Data domains this tool mutates, so the renderer can refresh the affected views. */
  affects?: AiDataKind[];
}

/** A tool definition before its tier is stamped on (see {@link createReadOnlyTools}). */
type UntieredTool = Omit<AiTool, 'tier'>;

/** Header/param names whose values are stripped before a request reaches the model. */
const SENSITIVE_KEY = /^(authorization|cookie|x-api-key|api-key|apikey|token|secret)$/i;
const REDACTED = '«redacted»';

function redactEntries(entries: KeyValueEntry[]): Array<{ key: string; value: string; enabled: boolean }> {
  return entries.map((entry) => ({
    key: entry.key,
    value: SENSITIVE_KEY.test(entry.key.trim()) ? REDACTED : entry.value,
    enabled: entry.enabled,
  }));
}

/** Projects a full request definition down to a secret-free summary for the model. */
function redactRequest(request: RequestDetailFull): unknown {
  const { details } = request;
  return {
    id: request.id,
    name: request.name,
    type: request.type,
    method: request.method,
    url: request.url,
    headers: redactEntries(details.headers),
    params: redactEntries(details.params),
    body: {
      mode: details.body.mode,
      rawType: details.body.rawType,
      rawBody: details.body.rawBody.slice(0, 4000),
    },
    description: details.description ?? '',
    // Stored auth (credentials/secrets) is deliberately omitted.
  };
}

function requireProject(deps: AiToolDeps): string {
  const projectId = deps.activeSelection().projectId;
  if (!projectId) throw new Error('No active project. Ask the user to open a project first.');
  return projectId;
}

/**
 * A compact, model-facing description of the workflow bundle shape. Returned by
 * `get_workflow_schema`. The authoritative schema is the `WorkflowExport` Zod
 * type (validated by `validate_workflow`); this guide keeps the model oriented
 * without dumping the full JSON Schema.
 */
const WORKFLOW_AUTHORING_GUIDE = {
  bundle: {
    formatVersion: 1,
    rootId: 'the id of the top-level workflow in `workflows`',
    workflows: '[{ id, name, description|null, graph: { nodes, edges, groups: [] } }]',
  },
  node: { id: 'unique', name: 'string', position: { x: 'number', y: 'number' }, kind: '…', config: '…' },
  edge: { id: 'unique', source: 'nodeId', target: 'nodeId', sourceHandle: 'branch label (condition/switch/loop)' },
  kinds: {
    start: 'config: {} — exactly one, the entry node.',
    end: 'config: {} — terminal node.',
    request: "config: { type:'http', payload:{ method, url, headers?, query?, body?:{type,content} }, extract?:[], requestId?: 'id of the collection request this came from' }",
    'set-variable': "config: { key, value, scope?: 'runtime'|'workspace'|'global' }",
    delay: 'config: { ms: 0..600000 }',
    transform: "config: { variable, engine:'template'|'jsonpath'|'jmespath'|'regex', input, expression }",
    condition: "config: { expression } — outgoing edges labelled 'true'/'false' via sourceHandle",
    'user-input': 'config: { message, fields:[] }',
  },
  wiring:
    'Wire linearly for a simple flow: start → node1 → … → nodeN → end. Use get_request to read a collection request, then set its method/url/headers/body into a request node payload and set requestId to the request id. Reference values from earlier steps with {{ variableName }}.',
} as const;

/** Builds the read-only tool set bound to the app's services. */
export function createReadOnlyTools(deps: AiToolDeps): AiTool[] {
  const tools: UntieredTool[] = [
    {
      def: {
        name: 'get_active_context',
        description:
          'Return the currently active workspace and project ids. Call this first to know the scope you are operating in.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
      run: async () => {
        const selection = deps.activeSelection();
        return { result: selection, summary: selection.projectId ? 'active project' : 'no project' };
      },
    },
    {
      def: {
        name: 'list_collections',
        description: 'List the collections in the active project (id and name).',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
      run: async () => {
        const projectId = requireProject(deps);
        const collections = deps.collections
          .listCollections(projectId)
          .map((c) => ({ id: c.id, name: c.name }));
        return { result: collections, summary: `${collections.length} collections` };
      },
    },
    {
      def: {
        name: 'get_collection_tree',
        description:
          'Return the folder/request tree of a collection as a flat, depth-annotated list. Use to see a collection\'s structure.',
        parameters: {
          type: 'object',
          properties: { collectionId: { type: 'string' } },
          required: ['collectionId'],
          additionalProperties: false,
        },
      },
      run: async (input) => {
        const { collectionId } = z.object({ collectionId: z.string() }).parse(input);
        const tree = deps.collections.getTree(collectionId);
        return { result: tree, summary: `${tree.length} nodes` };
      },
    },
    {
      def: {
        name: 'search_requests',
        description: 'Search requests within a collection by name/method/url substring.',
        parameters: {
          type: 'object',
          properties: { collectionId: { type: 'string' }, query: { type: 'string' } },
          required: ['collectionId', 'query'],
          additionalProperties: false,
        },
      },
      run: async (input) => {
        const { collectionId, query } = z
          .object({ collectionId: z.string(), query: z.string() })
          .parse(input);
        const matches = deps.collections
          .searchRequests(collectionId, query)
          .map((r) => ({ id: r.id, name: r.name, method: r.method, url: r.url }));
        return { result: matches, summary: `${matches.length} matches` };
      },
    },
    {
      def: {
        name: 'get_request',
        description:
          'Return a request\'s full definition (method, url, headers, params, body). Stored credentials and sensitive header values are redacted.',
        parameters: {
          type: 'object',
          properties: { requestId: { type: 'string' } },
          required: ['requestId'],
          additionalProperties: false,
        },
      },
      run: async (input) => {
        const { requestId } = z.object({ requestId: z.string() }).parse(input);
        const request = deps.collections.getRequest(requestId);
        return { result: redactRequest(request), summary: request.name || request.url };
      },
    },
    {
      def: {
        name: 'list_workflows',
        description: 'List the workflows in the active project (id and name).',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
      run: async () => {
        const projectId = requireProject(deps);
        const workflows = deps.workflows.list(projectId).map((w) => ({ id: w.id, name: w.name }));
        return { result: workflows, summary: `${workflows.length} workflows` };
      },
    },
    {
      def: {
        name: 'get_workflow',
        description: 'Return a workflow\'s node/edge graph so you can explain or reason about its steps.',
        parameters: {
          type: 'object',
          properties: { workflowId: { type: 'string' } },
          required: ['workflowId'],
          additionalProperties: false,
        },
      },
      run: async (input) => {
        const { workflowId } = z.object({ workflowId: z.string() }).parse(input);
        const detail = deps.workflows.get(workflowId);
        const nodes = detail.graph.nodes.map((n) => ({ id: n.id, kind: n.kind, name: n.name }));
        return {
          result: { id: detail.id, name: detail.name, nodes, edges: detail.graph.edges },
          summary: `${nodes.length} nodes`,
        };
      },
    },
    {
      def: {
        name: 'list_variables',
        description:
          'List variables in a scope. Secret values are masked (only presence is reported). scopeId is required for non-global scopes.',
        parameters: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['global', 'workspace', 'collection', 'folder', 'request', 'workflow', 'runtime'],
            },
            scopeId: { type: 'string' },
          },
          required: ['scope'],
          additionalProperties: false,
        },
      },
      run: async (input) => {
        const { scope, scopeId } = z
          .object({ scope: VariableScope, scopeId: z.string().optional() })
          .parse(input);
        const variables = deps.variables.list(scope, scopeId).map((v) => ({
          key: v.key,
          scope: v.scope,
          secret: v.secret,
          hasValue: v.hasValue,
          ...(v.value !== undefined ? { value: v.value } : {}),
        }));
        return { result: variables, summary: `${variables.length} variables` };
      },
    },
    {
      def: {
        name: 'get_workflow_schema',
        description:
          'Return a concise guide to the workflow bundle shape (node kinds, graph, and how a request node references a collection request), so you can build a valid workflow for create_workflow.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
      run: async () => ({ result: WORKFLOW_AUTHORING_GUIDE, summary: 'workflow schema guide' }),
    },
    {
      def: {
        name: 'validate_workflow',
        description:
          'Validate a candidate workflow export bundle against the app schema before creating it. Returns { valid, errors }. Always validate before calling create_workflow.',
        parameters: {
          type: 'object',
          properties: { workflow: { type: 'object', description: 'A workflow export bundle.' } },
          required: ['workflow'],
          additionalProperties: false,
        },
      },
      run: async (input) => {
        const parsed = WorkflowExport.safeParse((input as { workflow: unknown }).workflow);
        if (parsed.success) return { result: { valid: true, errors: [] }, summary: 'valid' };
        const errors = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        return { result: { valid: false, errors }, summary: `${errors.length} problems` };
      },
    },
  ];
  return tools.map((tool) => ({ ...tool, tier: 'read' as const }));
}

// --- Write tools (Phase 2) ---

/** Builds one editable KeyValueEntry list from the model's simplified pairs. */
function toEntries(
  pairs: Array<{ key: string; value: string; enabled?: boolean }> | undefined,
): KeyValueEntry[] {
  return (pairs ?? []).map((pair) => ({
    key: pair.key,
    value: pair.value,
    enabled: pair.enabled ?? true,
  }));
}

const KeyValueInput = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().optional(),
});

const CreateRequestInput = z.object({
  collectionId: z.string(),
  folderId: z.string().optional(),
  name: z.string().min(1),
  method: HttpMethod.default('GET'),
  url: z.string().default(''),
  headers: z.array(KeyValueInput).optional(),
  params: z.array(KeyValueInput).optional(),
  body: z
    .object({
      mode: z.enum(['none', 'raw', 'urlencoded', 'formdata', 'binary']).optional(),
      rawType: z.enum(['json', 'text', 'xml']).optional(),
      rawBody: z.string().optional(),
    })
    .optional(),
  description: z.string().optional(),
});

/**
 * Builds the write tool set (ADR-0012, Phase 2). Every tool here mutates app
 * state, so each is gated behind a user confirmation and an auto-snapshot in the
 * agent loop. `set_variable` refuses to store secrets — there is intentionally
 * no tool that writes secret material.
 */
export function createWriteTools(deps: AiToolDeps): AiTool[] {
  return [
    {
      def: {
        name: 'create_request',
        description:
          'Create a new HTTP request in a collection, with optional headers, query params, and body. Use this to turn a pasted cURL command or request description into a saved request.',
        parameters: {
          type: 'object',
          properties: {
            collectionId: { type: 'string' },
            folderId: { type: 'string', description: 'Optional parent folder id.' },
            name: { type: 'string' },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
            },
            url: { type: 'string' },
            headers: {
              type: 'array',
              items: {
                type: 'object',
                properties: { key: { type: 'string' }, value: { type: 'string' } },
                required: ['key', 'value'],
                additionalProperties: false,
              },
            },
            params: {
              type: 'array',
              items: {
                type: 'object',
                properties: { key: { type: 'string' }, value: { type: 'string' } },
                required: ['key', 'value'],
                additionalProperties: false,
              },
            },
            body: {
              type: 'object',
              properties: {
                mode: { type: 'string', enum: ['none', 'raw', 'urlencoded', 'formdata', 'binary'] },
                rawType: { type: 'string', enum: ['json', 'text', 'xml'] },
                rawBody: { type: 'string' },
              },
              additionalProperties: false,
            },
            description: { type: 'string' },
          },
          required: ['collectionId', 'name'],
          additionalProperties: false,
        },
      },
      tier: 'write',
      affects: ['collections'],
      describe: (input) => {
        const parsed = CreateRequestInput.safeParse(input);
        if (!parsed.success) return 'Create a request';
        return `Create request "${parsed.data.method} ${parsed.data.name}"`;
      },
      snapshotCollectionId: (input) => {
        const parsed = CreateRequestInput.safeParse(input);
        return parsed.success ? parsed.data.collectionId : undefined;
      },
      run: async (input) => {
        const data = CreateRequestInput.parse(input);
        const summary = deps.collections.createRequest({
          collectionId: data.collectionId,
          ...(data.folderId ? { folderId: data.folderId } : {}),
          name: data.name,
          method: data.method,
          url: data.url,
        });
        const details: RequestDetails = {
          ...emptyDetails(),
          headers: toEntries(data.headers),
          params: toEntries(data.params),
          ...(data.description ? { description: data.description } : {}),
          ...(data.body
            ? {
                body: {
                  ...emptyDetails().body,
                  mode: data.body.mode ?? 'none',
                  rawType: data.body.rawType ?? 'json',
                  rawBody: data.body.rawBody ?? '',
                },
              }
            : {}),
        };
        const saved = deps.collections.saveRequest({ id: summary.id, details });
        return { result: { id: saved.id, name: saved.name }, summary: `created "${saved.name}"` };
      },
    },
    {
      def: {
        name: 'update_request',
        description: "Update an existing request's name, method, and/or url.",
        parameters: {
          type: 'object',
          properties: {
            requestId: { type: 'string' },
            name: { type: 'string' },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
            },
            url: { type: 'string' },
          },
          required: ['requestId'],
          additionalProperties: false,
        },
      },
      tier: 'write',
      affects: ['collections'],
      describe: (input) => {
        const id = typeof input['requestId'] === 'string' ? input['requestId'] : '';
        return `Update request ${id}`;
      },
      snapshotCollectionId: (input) => {
        const id = typeof input['requestId'] === 'string' ? input['requestId'] : undefined;
        if (!id) return undefined;
        try {
          return deps.collections.getRequest(id).collectionId;
        } catch {
          return undefined;
        }
      },
      run: async (input) => {
        const data = z
          .object({
            requestId: z.string(),
            name: z.string().optional(),
            method: HttpMethod.optional(),
            url: z.string().optional(),
          })
          .parse(input);
        const summary = deps.collections.updateRequest(data.requestId, {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.method !== undefined ? { method: data.method } : {}),
          ...(data.url !== undefined ? { url: data.url } : {}),
        });
        return { result: { id: summary.id, name: summary.name }, summary: `updated "${summary.name}"` };
      },
    },
    {
      def: {
        name: 'create_folder',
        description: 'Create a folder in a collection, optionally nested under a parent folder.',
        parameters: {
          type: 'object',
          properties: {
            collectionId: { type: 'string' },
            parentId: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['collectionId', 'name'],
          additionalProperties: false,
        },
      },
      tier: 'write',
      affects: ['collections'],
      describe: (input) => {
        const name = typeof input['name'] === 'string' ? input['name'] : '';
        return `Create folder "${name}"`;
      },
      snapshotCollectionId: (input) =>
        typeof input['collectionId'] === 'string' ? input['collectionId'] : undefined,
      run: async (input) => {
        const data = z
          .object({
            collectionId: z.string(),
            parentId: z.string().optional(),
            name: z.string().min(1),
          })
          .parse(input);
        const folder = deps.collections.createFolder({
          collectionId: data.collectionId,
          ...(data.parentId ? { parentId: data.parentId } : {}),
          name: data.name,
        });
        return { result: { id: folder.id, name: folder.name }, summary: `created folder "${folder.name}"` };
      },
    },
    {
      def: {
        name: 'set_variable',
        description:
          'Set a NON-SECRET variable in a scope. Cannot store secrets. scopeId is required for non-global scopes.',
        parameters: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['global', 'workspace', 'collection', 'folder', 'request', 'workflow', 'runtime'],
            },
            scopeId: { type: 'string' },
            key: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['scope', 'key', 'value'],
          additionalProperties: false,
        },
      },
      tier: 'write',
      affects: ['variables'],
      describe: (input) => {
        const key = typeof input['key'] === 'string' ? input['key'] : '';
        const scope = typeof input['scope'] === 'string' ? input['scope'] : '';
        return `Set ${scope} variable "${key}"`;
      },
      run: async (input) => {
        const data = z
          .object({
            scope: VariableScope,
            scopeId: z.string().optional(),
            key: z.string().min(1),
            value: z.string(),
          })
          .parse(input);
        const variable = deps.variables.set({
          scope: data.scope,
          ...(data.scopeId !== undefined ? { scopeId: data.scopeId } : {}),
          key: data.key,
          value: data.value,
          secret: false,
        });
        return { result: { key: variable.key, scope: variable.scope }, summary: `set "${variable.key}"` };
      },
    },
    {
      def: {
        name: 'create_workflow',
        description:
          'Create a new workflow from a full export bundle (nodes + edges). Validate it with validate_workflow first. Imported non-destructively with fresh ids into the active project — it never overwrites an existing workflow.',
        parameters: {
          type: 'object',
          properties: { workflow: { type: 'object', description: 'A validated workflow export bundle.' } },
          required: ['workflow'],
          additionalProperties: false,
        },
      },
      tier: 'write',
      affects: ['workflows'],
      describe: (input) => {
        const parsed = WorkflowExport.safeParse((input as { workflow: unknown }).workflow);
        if (!parsed.success) return 'Create a workflow';
        const root = parsed.data.workflows.find((w) => w.id === parsed.data.rootId);
        return `Create workflow "${root?.name ?? 'workflow'}" (${parsed.data.workflows.length} workflow(s))`;
      },
      run: async (input) => {
        const projectId = requireProject(deps);
        const data = WorkflowExport.parse((input as { workflow: unknown }).workflow);
        const created = deps.workflows.importWorkflow({ projectId, data });
        return { result: { id: created.id, name: created.name }, summary: `created "${created.name}"` };
      },
    },
    {
      def: {
        name: 'run_workflow',
        description:
          'Run an existing workflow to completion and return its status and per-node outcomes. This executes real requests over the network. User-input nodes fall back to their defaults (headless).',
        parameters: {
          type: 'object',
          properties: {
            workflowId: { type: 'string' },
            runtime: {
              type: 'object',
              description: 'Optional runtime variables (name → string value) seeded before the run.',
            },
          },
          required: ['workflowId'],
          additionalProperties: false,
        },
      },
      tier: 'execute',
      // A run can persist workspace/global variables via set-variable nodes.
      affects: ['variables'],
      describe: (input) => {
        const id = typeof input['workflowId'] === 'string' ? input['workflowId'] : '';
        let name = id;
        try {
          name = deps.workflows.get(id).name;
        } catch {
          // fall back to id in the preview
        }
        return `Run workflow "${name}" (executes live requests)`;
      },
      run: async (input) => {
        const data = z
          .object({ workflowId: z.string(), runtime: z.record(z.string()).optional() })
          .parse(input);
        const workspaceId = deps.activeSelection().workspaceId;
        const result = await deps.workflows.run({
          workflowId: data.workflowId,
          ...(data.runtime ? { runtime: data.runtime } : {}),
          ...(workspaceId ? { workspaceId } : {}),
        });
        // Return node statuses and the names of variables produced — not their
        // values, which may contain tokens or other secrets from responses.
        return {
          result: {
            status: result.status,
            durationMs: result.durationMs,
            nodeResults: result.nodeResults.map((node) => ({
              nodeId: node.nodeId,
              name: node.name,
              status: node.status,
            })),
            producedVariableKeys: Object.keys(result.finalVariables),
          },
          summary: `run ${result.status}`,
        };
      },
    },
  ];
}
