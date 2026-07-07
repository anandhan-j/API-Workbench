export interface FaqItem {
  q: string;
  a: string;
}

export const faqItems: FaqItem[] = [
  {
    q: 'Is API Workbench really free?',
    a: 'Yes. API Workbench is open source under the MIT license. There is no paid tier, no account requirement, and no telemetry you cannot turn off. You can use it commercially, fork it, and redistribute it.',
  },
  {
    q: 'How is this different from Postman or Insomnia?',
    a: 'Three things: it is offline-first (everything is stored in a local SQLite database — no cloud sync required, ever), its OpenAPI sync merges spec changes without destroying your manual edits, and workflows are a first-class visual automation engine rather than a scripting afterthought. Plus a sandboxed plugin system with user-approved capabilities.',
  },
  {
    q: 'Where is my data stored?',
    a: 'In a local SQLite database in your OS application-data directory. Secrets are encrypted with your operating system keychain (safeStorage) and are only ever decrypted in the main process — the UI never sees secret plaintext. Backup and restore are built in.',
  },
  {
    q: 'Which platforms are supported?',
    a: 'Windows, macOS, and Linux. API Workbench is an Electron app built from a single codebase; installers for all three platforms are produced by the packaging phase, and you can always build from source with Node 20+.',
  },
  {
    q: 'Can I import my existing OpenAPI / Swagger specs?',
    a: 'Yes — OpenAPI 3.x and Swagger 2, in JSON or YAML, from a file or a URL. The importer generates collections, folders, operations, examples, and schemas. When the spec changes later, the sync engine diffs and merges instead of re-importing from scratch.',
  },
  {
    q: 'What happens to my edits when I re-sync a changed spec?',
    a: 'The sync engine detects added, changed, and removed endpoints and merges safely: your manual edits (names, headers, bodies, tests) are preserved, conflicts are surfaced for review, and an automatic snapshot is taken before the merge so you can roll back with one click.',
  },
  {
    q: 'Which protocols can I test?',
    a: 'REST/HTTP is fully supported (streaming, multipart, uploads, downloads, retries). GraphQL, gRPC, WebSocket, and SSE are supported in the runner and workflows, including live interactive sessions for WebSocket/SSE. Plugins can add entirely new request types.',
  },
  {
    q: 'How do workflows differ from request chaining?',
    a: 'Workflows are real programs on a visual canvas: conditions, loops, switch, parallel branches, retries, timeouts, pause/resume, sub-workflows, and user-input prompts. Data flows between steps through runtime variables with JSONPath/JMESPath extraction and visual mapping.',
  },
  {
    q: 'Is there an AI assistant, and does it send my data to the cloud?',
    a: 'There is a built-in assistant, but it is strictly bring-your-own-key and opt-in. You connect your own provider — Anthropic Claude, OpenAI, DeepSeek, Groq, OpenRouter, or a local Ollama endpoint — and your key is encrypted with the OS keychain and never leaves the main process. With no key configured, the assistant makes no network calls at all. The only traffic is between your machine and the provider you chose; secrets in your variables and requests are redacted before anything reaches the model.',
  },
  {
    q: 'What can the AI assistant actually do, and can it break my data?',
    a: 'It works on your real collections, requests, workflows, and non-secret variables through the app’s own APIs — reading instantly, but every write waits for your approval and every run always confirms. Before its first edit in a turn it auto-snapshots the affected collection, so any change is one click to undo. It cannot delete anything or read or set secrets.',
  },
  {
    q: 'What is the MCP server for?',
    a: 'The Model Context Protocol server lets external AI clients — Claude Desktop, Cursor, Copilot, and others — author workflows against API Workbench’s real, generated schema and import them straight into your open project. It ships as a standalone package (@api-workbench/workflow-mcp) you can run over stdio, or the app spawns and manages it over loopback Streamable HTTP. In HTTP mode it binds to localhost only, requires a bearer token on every request, validates origins against DNS-rebinding, and defaults to TLS. You start and stop it from Settings — it never runs at boot.',
  },
  {
    q: 'Are plugins safe to install?',
    a: 'Plugin code runs in an isolated utility process with no Electron or filesystem access. Anything sensitive — network calls, reading variables, showing dialogs — requires a capability the plugin declares in its manifest and you approve at install time. The host enforces grants on every single call.',
  },
  {
    q: 'Can I write my own plugin?',
    a: 'Yes — the @api-workbench/plugin-sdk package is a small, types-only contract. A plugin is a manifest.json plus a bundled CommonJS entry that registers executors. See the Plugin Documentation for a full guide; the repo ships eight example plugins covering every extension point.',
  },
  {
    q: 'Does it work fully offline?',
    a: 'Yes. Import from local files, execute against localhost or intranet APIs, and never touch the internet. Only the requests you explicitly send leave your machine.',
  },
  {
    q: 'How do I report a bug or request a feature?',
    a: 'Open an issue on GitHub. Bug reports with reproduction steps and feature requests with a concrete use case are triaged fastest. Pull requests are welcome — see the Contributing guide.',
  },
];
