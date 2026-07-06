export interface WorkflowStep {
  icon: string;
  title: string;
  description: string;
  detail: string;
}

/** The end-to-end journey illustrated on the Workflow page. */
export const workflowSteps: WorkflowStep[] = [
  {
    icon: 'Download',
    title: 'Install',
    description: 'Grab the installer for Windows, macOS, or Linux — or build from source.',
    detail: 'No account, no sign-in. First launch creates a local SQLite database and a default workspace.',
  },
  {
    icon: 'Rocket',
    title: 'Launch',
    description: 'Open the app and land in your workspace.',
    detail: 'Workspaces keep clients, projects, and environments fully separate — switch or create them freely.',
  },
  {
    icon: 'FileJson',
    title: 'Import your spec',
    description: 'Point at an OpenAPI 3.x or Swagger 2 file or URL.',
    detail: 'Collections, folders, operations, examples, and schemas are generated. Re-sync later merges changes without losing your edits.',
  },
  {
    icon: 'Braces',
    title: 'Configure variables & auth',
    description: 'Set {{baseUrl}}, secrets, and credentials once.',
    detail: 'Seven variable scopes with strict precedence. Secrets encrypt via the OS keychain. Eight auth schemes sign requests automatically.',
  },
  {
    icon: 'Send',
    title: 'Send requests',
    description: 'Execute REST, GraphQL, gRPC, WebSocket, and SSE.',
    detail: 'Streaming, multipart, retries, cancellation, and a response viewer with timing, size, and pretty-printed bodies.',
  },
  {
    icon: 'FlaskConical',
    title: 'Assert & test',
    description: 'Add assertions and JavaScript tests to any request.',
    detail: 'Status, header, body, and JSON Schema assertions run on every execution and report in a structured panel.',
  },
  {
    icon: 'Workflow',
    title: 'Design workflows',
    description: 'Drag requests onto the canvas and wire them together.',
    detail: 'Conditions, loops, switch, parallel branches, sub-workflows, and user-input prompts — mapped visually with JSONPath/JMESPath.',
  },
  {
    icon: 'Play',
    title: 'Run & observe',
    description: 'Execute workflows with live step-by-step logs.',
    detail: 'Retries and timeouts per step; pause, resume, or cancel long runs. Runtime variables propagate values between steps.',
  },
  {
    icon: 'Puzzle',
    title: 'Extend with plugins',
    description: 'Add custom nodes, request types, auth, and importers.',
    detail: 'Plugins run sandboxed in a separate process; every sensitive capability requires your explicit grant.',
  },
];
