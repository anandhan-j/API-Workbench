import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The bundled example workflow library, surfaced as `workflow://examples/{name}`
 * resources and referenced by the "create workflow" prompt.
 *
 * Each file under `src/examples/` is a full `.workflow.json` export bundle in
 * canonical form, hand-authored to validate against the generated schema (a
 * guard test in the desktop workspace enforces that). The build step copies the
 * JSON to `dist/examples/`, next to the compiled loader.
 */

interface ExampleMeta {
  /** Slug used in the resource URI: `workflow://examples/<name>`. */
  name: string;
  title: string;
  description: string;
  file: string;
}

const EXAMPLES: readonly ExampleMeta[] = [
  {
    name: 'hello-world',
    title: 'Hello World',
    description: 'The minimal linear workflow: start, one GET request, end.',
    file: 'hello-world.workflow.json',
  },
  {
    name: 'auth-flow',
    title: 'Authenticated request with extraction',
    description:
      'Prompt for a secret API token, call a bearer-authenticated endpoint, extract a value, and branch on it with a condition node.',
    file: 'auth-flow.workflow.json',
  },
  {
    name: 'full-feature',
    title: 'Full feature tour',
    description:
      'A tour of most node kinds in canonical form: set-variable, user-input (select), request, transform, switch, loop, delay.',
    file: 'full-feature.workflow.json',
  },
  {
    name: 'create-post',
    title: 'Create post (write flow)',
    description:
      'A write flow: collect fields, POST to create a resource, extract the new id, then verify the write with a GET and branch on the outcome.',
    file: 'create-post.workflow.json',
  },
];

function readExample(file: string): string {
  const url = new URL(`./examples/${file}`, import.meta.url);
  return readFileSync(fileURLToPath(url), 'utf8');
}

export interface WorkflowExample extends ExampleMeta {
  /** Raw `.workflow.json` text. */
  json: string;
}

export function listExampleMeta(): readonly ExampleMeta[] {
  return EXAMPLES;
}

export function exampleNames(): string[] {
  return EXAMPLES.map((e) => e.name);
}

export function getExample(name: string): WorkflowExample | undefined {
  const meta = EXAMPLES.find((e) => e.name === name);
  if (!meta) return undefined;
  return { ...meta, json: readExample(meta.file) };
}
