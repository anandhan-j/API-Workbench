import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { appBridge, type AppBridge } from './app-bridge.js';
import { assembleWorkflow, generateSpecShape, type GenerateSpec } from './generate.js';
import { buildOverwriteMessage, summarizeWorkflow, type WorkflowSummary } from './persist.js';
import { getSchema, type SchemaRoot } from './schema.js';
import { validateWorkflow } from './validate.js';

const rootArg = z
  .enum(['export', 'graph'])
  .optional()
  .describe(
    "Which schema to use: 'export' (a full .workflow.json export bundle — the default) or 'graph' (a bare workflow graph: { nodes, edges, groups }).",
  );

/**
 * Registers the model-controlled tools. Tools are the most universally supported
 * MCP primitive, so `get_workflow_schema` guarantees the schema reaches clients
 * that do not surface resources, and `validate_workflow` returns tool-execution
 * errors (`isError: true`) — which, unlike protocol errors, are fed back into the
 * model's context so it can self-correct.
 */
export function registerTools(server: McpServer): void {
  server.registerTool(
    'get_workflow_schema',
    {
      title: 'Get workflow JSON Schema',
      description:
        'Returns the JSON Schema (draft-07) that an API Workbench .workflow.json file must satisfy. Read it before authoring a workflow, then check your JSON with validate_workflow.',
      inputSchema: { root: rootArg },
    },
    ({ root }) => {
      const schema = getSchema((root ?? 'export') as SchemaRoot);
      return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] };
    },
  );

  server.registerTool(
    'validate_workflow',
    {
      title: 'Validate a workflow',
      description:
        'Validates a candidate workflow against the API Workbench schema. On success returns a confirmation; on failure returns isError with precise, actionable problems (exact JSON path, allowed values, and the actual value) so you can fix each and re-validate. Accepts a JSON object or a JSON string.',
      inputSchema: {
        workflow: z
          .union([z.string(), z.record(z.unknown())])
          .describe(
            'The workflow to validate — a full .workflow.json export bundle (default) or a bare graph. May be a JSON object or a JSON string.',
          ),
        root: rootArg,
      },
    },
    ({ workflow, root }) => {
      let data: unknown;
      if (typeof workflow === 'string') {
        try {
          data = JSON.parse(workflow);
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `The workflow is not valid JSON and could not be parsed: ${(err as Error).message}`,
              },
            ],
          };
        }
      } else {
        data = workflow;
      }

      const result = validateWorkflow(data, (root ?? 'export') as SchemaRoot);

      if (result.valid) {
        return {
          structuredContent: { valid: true, errors: [] },
          content: [
            {
              type: 'text',
              text: `✓ Valid — this workflow conforms to the "${result.root}" schema and will import into API Workbench.`,
            },
          ],
        };
      }

      const lines = result.errors.map((e, i) => `${i + 1}. ${e.message}`).join('\n');
      return {
        isError: true,
        structuredContent: { valid: false, errors: result.errors },
        content: [
          {
            type: 'text',
            text: `✗ Invalid — ${result.errors.length} problem(s) found in the "${result.root}" workflow. Fix each and re-validate:\n\n${lines}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'generate_workflow',
    {
      title: 'Generate a workflow',
      description:
        'Assembles a canonical .workflow.json bundle from a high-level, linear spec: it inserts start/end nodes, generates ids, auto-positions nodes, wraps requests in the protocol envelope, fills defaults, and validates the result before returning. Best for linear flows (set variables, requests, transforms, prompts); author branching/looping workflows directly and check them with validate_workflow. Optionally writes the file to disk.',
      inputSchema: {
        ...generateSpecShape,
        writeToDisk: z
          .string()
          .optional()
          .describe('Absolute file path to write the generated .workflow.json to. Omit to only return it.'),
      },
    },
    ({ writeToDisk, ...spec }) => {
      const bundle = assembleWorkflow(spec as GenerateSpec, { now: Date.now() });
      const result = validateWorkflow(bundle, 'export');

      if (!result.valid) {
        const lines = result.errors.map((e, i) => `${i + 1}. ${e.message}`).join('\n');
        return {
          isError: true,
          structuredContent: { valid: false, errors: result.errors },
          content: [
            {
              type: 'text',
              text: `The assembled workflow failed validation (${result.errors.length} problem(s)). This usually means a step value was malformed. Fix the spec and retry:\n\n${lines}`,
            },
          ],
        };
      }

      const json = `${JSON.stringify(bundle, null, 2)}\n`;
      let note = '';
      if (writeToDisk) {
        try {
          writeFileSync(writeToDisk, json, 'utf8');
          note = `\n\nWritten to ${writeToDisk}`;
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `The workflow generated and validated, but could not be written to ${writeToDisk}: ${(err as Error).message}`,
              },
            ],
          };
        }
      }

      return {
        structuredContent: { valid: true, workflow: bundle },
        content: [
          {
            type: 'text',
            text: `✓ Generated a valid workflow with ${spec.steps.length} step(s).${note}\n\n${json}`,
          },
        ],
      };
    },
  );

  registerAddOrUpdateWorkflow(server);
  registerImportWorkflowToApp(server);
}

/**
 * `import_workflow_to_app` — imports a workflow directly into the running API
 * Workbench app so it appears in the workflow list, reusing the app's own import
 * path (it is added as a new workflow with fresh ids — a non-destructive, additive
 * operation, so no overwrite confirmation is needed).
 *
 * Only works when this server was launched by the app (the app-managed HTTP
 * child); in standalone/stdio mode the back-channel is absent and the tool says
 * so, pointing at `add_or_update_workflow` (write to disk) instead.
 */
export function registerImportWorkflowToApp(server: McpServer, bridge: AppBridge = appBridge()): void {
  server.registerTool(
    'import_workflow_to_app',
    {
      title: 'Import a workflow into the running app',
      description:
        'Imports a workflow (a full .workflow.json export bundle) directly into the running API Workbench app, where it appears in the workflow list immediately. Added as a NEW workflow (fresh ids) in the app’s active project — non-destructive. Requires the app to be running and this server to have been launched by it; otherwise use add_or_update_workflow to write a file. Validates the workflow before importing.',
      inputSchema: {
        workflow: z
          .union([z.string(), z.record(z.unknown())])
          .describe('The workflow to import — a full .workflow.json export bundle, as a JSON object or string.'),
      },
    },
    async ({ workflow }) => {
      if (!bridge.available) {
        return errorResult(
          'Not connected to a running API Workbench app — this tool only works when the server is launched by the app. ' +
            'To save the workflow as a file instead, use add_or_update_workflow with a path.',
        );
      }

      let data: unknown;
      if (typeof workflow === 'string') {
        try {
          data = JSON.parse(workflow);
        } catch (err) {
          return errorResult(`The workflow is not valid JSON and could not be parsed: ${(err as Error).message}`);
        }
      } else {
        data = workflow;
      }

      const validation = validateWorkflow(data, 'export');
      if (!validation.valid) {
        const lines = validation.errors.map((e, i) => `${i + 1}. ${e.message}`).join('\n');
        return errorResult(
          `✗ Not imported — the workflow has ${validation.errors.length} problem(s). Fix each and retry:\n\n${lines}`,
        );
      }

      const res = await bridge.call('importWorkflow', { workflow: data });
      if (!res.ok) return errorResult(`✗ Not imported — ${res.error}`);

      const result = (res.result ?? {}) as { id?: string; name?: string };
      const label = result.name ? `"${result.name}"` : 'the workflow';
      const id = result.id ? ` (id ${result.id})` : '';
      return {
        structuredContent: { imported: true, workflow: result },
        content: [
          {
            type: 'text',
            text: `✓ Imported ${label} into API Workbench${id}. It now appears in the workflow list.`,
          },
        ],
      };
    },
  );
}

/**
 * Reads and summarises an existing `.workflow.json` so an overwrite confirmation
 * can show what is being replaced. Best-effort: returns null if the file can't be
 * read or parsed (the confirmation still proceeds, noting the file is unreadable).
 */
function summarizeExistingFile(path: string): WorkflowSummary | null {
  try {
    return summarizeWorkflow(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * `add_or_update_workflow` — writes a workflow bundle to a `.workflow.json` file.
 *
 * The safety rule this enforces: **overwriting an existing workflow file always
 * requires an explicit user confirmation.** Writing a brand-new file needs no
 * confirmation. On update we ask via MCP elicitation (showing the file path and a
 * before→after summary) and only write on an affirmative `accept`. Clients that
 * don't support elicitation can't prompt interactively, so the tool instead
 * refuses to overwrite unless the caller passes `confirmUpdate: true` — which the
 * tool description ties to first confirming with the user. Either way, an update
 * cannot happen silently.
 */
function registerAddOrUpdateWorkflow(server: McpServer): void {
  server.registerTool(
    'add_or_update_workflow',
    {
      title: 'Add or update a workflow file',
      description:
        'Writes a workflow (a full .workflow.json export bundle) to a file on disk. Creating a new file is unconditional; UPDATING (overwriting) an existing file ALWAYS requires user confirmation — the tool prompts the user (showing the workflow name, id, and node/edge counts) and only overwrites if they accept. If your client cannot show a prompt, confirm with the user yourself and re-run with confirmUpdate: true. Validates the workflow before writing.',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('Absolute path of the .workflow.json file to write (created or overwritten).'),
        workflow: z
          .union([z.string(), z.record(z.unknown())])
          .describe('The workflow to write — a full .workflow.json export bundle, as a JSON object or string.'),
        confirmUpdate: z
          .boolean()
          .optional()
          .describe(
            'Set true ONLY after the user has confirmed overwriting an existing file. Used as the confirmation when the client cannot show an interactive prompt; ignored when creating a new file.',
          ),
      },
    },
    async ({ path, workflow, confirmUpdate }) => {
      let data: unknown;
      if (typeof workflow === 'string') {
        try {
          data = JSON.parse(workflow);
        } catch (err) {
          return errorResult(`The workflow is not valid JSON and could not be parsed: ${(err as Error).message}`);
        }
      } else {
        data = workflow;
      }

      // Never write an invalid workflow — it would just fail to import later.
      const validation = validateWorkflow(data, 'export');
      if (!validation.valid) {
        const lines = validation.errors.map((e, i) => `${i + 1}. ${e.message}`).join('\n');
        return errorResult(
          `✗ Not written — the workflow has ${validation.errors.length} problem(s). Fix each and retry:\n\n${lines}`,
        );
      }

      const incoming = summarizeWorkflow(data);
      const isUpdate = existsSync(path);

      if (isUpdate) {
        const existing = summarizeExistingFile(path);
        const message = buildOverwriteMessage(path, existing, incoming);
        const decision = await confirmOverwrite(server, message, confirmUpdate === true);
        if (!decision.proceed) return errorResult(decision.reason);
      }

      const json = `${JSON.stringify(data, null, 2)}\n`;
      try {
        writeFileSync(path, json, 'utf8');
      } catch (err) {
        return errorResult(`The workflow validated but could not be written to ${path}: ${(err as Error).message}`);
      }

      const verb = isUpdate ? 'Updated' : 'Created';
      return {
        structuredContent: { path, action: isUpdate ? 'updated' : 'created', workflow: data },
        content: [{ type: 'text', text: `✓ ${verb} ${path}\n\n${json}` }],
      };
    },
  );
}

type OverwriteDecision = { proceed: true } | { proceed: false; reason: string };

/**
 * Runs the mandatory overwrite confirmation. Prefers an interactive MCP
 * elicitation; falls back to requiring the explicit `confirmUpdate` flag on
 * clients that can't prompt. Returns whether the write may proceed.
 */
async function confirmOverwrite(
  server: McpServer,
  message: string,
  confirmUpdate: boolean,
): Promise<OverwriteDecision> {
  const supportsElicitation = Boolean(server.server.getClientCapabilities()?.elicitation);

  if (supportsElicitation) {
    const result = await server.server.elicitInput({
      message,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            title: 'Overwrite the existing workflow?',
            description: 'Yes replaces the existing file; No leaves it unchanged.',
          },
        },
        required: ['confirm'],
      },
    });
    const confirmed = result.action === 'accept' && result.content?.confirm === true;
    if (!confirmed) {
      return { proceed: false, reason: 'Update cancelled — the existing workflow file was left unchanged.' };
    }
    return { proceed: true };
  }

  if (!confirmUpdate) {
    return {
      proceed: false,
      reason:
        `${message}\n\nThis MCP client cannot show a confirmation prompt. Confirm with the user, then call ` +
        'add_or_update_workflow again with "confirmUpdate": true. The existing file was left unchanged.',
    };
  }
  return { proceed: true };
}

/** A tool-execution error result (fed back into the model's context to self-correct). */
function errorResult(text: string): { isError: true; content: { type: 'text'; text: string }[] } {
  return { isError: true, content: [{ type: 'text', text }] };
}
