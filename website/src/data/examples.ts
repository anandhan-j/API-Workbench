import type { MockupKind } from '../components/Mockups';
import { site } from '../lib/site';

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface ExampleProject {
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  extensionPoint: string;
  capabilities: string[];
  mockup: MockupKind;
  sourceUrl: string;
  highlights: string[];
}

const examplesBase = `${site.repoUrl}/tree/master/plugins/examples`;

/** The real example plugins shipped in plugins/examples/ — one per extension point. */
export const exampleProjects: ExampleProject[] = [
  {
    slug: 'uuid-node',
    title: 'UUID Node',
    description: 'The smallest possible plugin: a workflow node that generates a UUID and writes it to a runtime variable of your choice.',
    difficulty: 'Beginner',
    extensionPoint: 'Workflow node',
    capabilities: [],
    mockup: 'workflow',
    sourceUrl: `${examplesBase}/uuid-node`,
    highlights: ['Minimal manifest + activate()', 'Writes runtime variables', 'Declares producesVariables for {{…}} autocomplete'],
  },
  {
    slug: 'csv-importer',
    title: 'CSV Importer',
    description: 'Turns a CSV of method/path/name rows into a full collection. Shows detect() sniffing and collection generation from parsed content.',
    difficulty: 'Beginner',
    extensionPoint: 'Importer',
    capabilities: [],
    mockup: 'requests',
    sourceUrl: `${examplesBase}/csv-importer`,
    highlights: ['detect() content sniffing', 'File-extension registration', 'Produces folders from tags'],
  },
  {
    slug: 'header-token-auth',
    title: 'Header Token Auth',
    description: 'A custom auth provider that signs requests with a configurable header token. Secret config fields are encrypted at rest automatically.',
    difficulty: 'Beginner',
    extensionPoint: 'Auth provider',
    capabilities: [],
    mockup: 'variables',
    sourceUrl: `${examplesBase}/header-token-auth`,
    highlights: ['Declarative credential form', 'secret fields encrypted', 'Returns AuthArtifacts headers'],
  },
  {
    slug: 'echo-request-type',
    title: 'Echo Request Type',
    description: 'A custom request type with its own payload editor and badge. Echoes the payload back as a ProtocolResult rendered by the generic viewer.',
    difficulty: 'Intermediate',
    extensionPoint: 'Request type',
    capabilities: [],
    mockup: 'requests',
    sourceUrl: `${examplesBase}/echo-request-type`,
    highlights: ['payloadSchema-driven editor', 'Summary badge + target key', 'ProtocolResult with metadata'],
  },
  {
    slug: 'user-input-node',
    title: 'User Input Node',
    description: 'Prompts the user mid-run with typed fields (string, secret, number, boolean, select, key-value) and merges answers into runtime variables.',
    difficulty: 'Intermediate',
    extensionPoint: 'Workflow node',
    capabilities: [],
    mockup: 'workflow',
    sourceUrl: `${examplesBase}/user-input-node`,
    highlights: ['input prompt fields', 'Runtime-filled lists', 'Host-rendered native modal'],
  },
  {
    slug: 'approval-dialog-node',
    title: 'Approval Dialog Node',
    description: 'A branching node that pauses the workflow and asks for approval via a host-rendered dialog, then routes along the approved/rejected branch.',
    difficulty: 'Intermediate',
    extensionPoint: 'Workflow node + ui:dialog',
    capabilities: ['ui:dialog'],
    mockup: 'workflow',
    sourceUrl: `${examplesBase}/approval-dialog-node`,
    highlights: ['Branching node', 'context.ui.showDialog', 'Headless-run cancellation handling'],
  },
  {
    slug: 'pick-item-node',
    title: 'Pick Item Node',
    description: 'Shows a dropdown dialog built from a config-defined list and stores the selection — a pattern for human-in-the-loop data selection.',
    difficulty: 'Intermediate',
    extensionPoint: 'Workflow node + ui:dialog',
    capabilities: ['ui:dialog'],
    mockup: 'workflow',
    sourceUrl: `${examplesBase}/pick-item-node`,
    highlights: ['Select fields in dialogs', 'Config-driven options', 'Variable output declaration'],
  },
  {
    slug: 'interactive-echo',
    title: 'Interactive Echo',
    description: 'A live, bidirectional request type: opens a session, echoes every frame you send, and reports lifecycle state — the template for custom protocol clients.',
    difficulty: 'Advanced',
    extensionPoint: 'Interactive request type',
    capabilities: [],
    mockup: 'terminal',
    sourceUrl: `${examplesBase}/interactive-echo`,
    highlights: ['openConnection() sessions', 'emit() event frames', 'setState lifecycle reporting'],
  },
];
