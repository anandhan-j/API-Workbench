import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * A user-invoked template that kicks off workflow authoring. It orients the
 * model toward the schema + examples and the generate/validate tools, and
 * insists on a final validation pass so the result imports into API Workbench.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'create_workflow_from_description',
    {
      title: 'Create workflow from description',
      description: 'Draft an API Workbench workflow from a plain-language description.',
      argsSchema: {
        description: z
          .string()
          .describe('What the workflow should do, in plain language.'),
      },
    },
    ({ description }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Create an API Workbench workflow that does the following:`,
              ``,
              description,
              ``,
              `Guidance:`,
              `1. Read the schema first — call the get_workflow_schema tool (or read the workflow://schema resource). Skim workflow://examples/full-feature for the shape of each node kind.`,
              `2. For a linear flow (set variables, requests, transforms, prompts), call generate_workflow with a structured spec — it wires start/end, ids, positions, and the request envelope for you.`,
              `3. For branching (condition/switch) or loops, author the .workflow.json directly following the schema.`,
              `4. ALWAYS finish by calling validate_workflow on the result. If it returns errors, fix each one it names and validate again until it passes.`,
              `5. Use {{variableName}} templates to pass values between steps; request nodes can extract response values into variables.`,
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
