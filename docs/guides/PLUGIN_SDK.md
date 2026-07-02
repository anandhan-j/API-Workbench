# Plugin SDK Guide

API Workbench plugins add **workflow nodes**, **request types**, **auth providers**, and **importers** without forking the core. This guide covers authoring, packaging, and installing a plugin against SDK **1.0.0** (`@api-workbench/plugin-sdk`). Architecture background: [ADR-0007](../adr/0007-plugin-sdk-boundary.md), [ADR-0009](../adr/0009-protocol-abstraction.md), [ADR-0010](../adr/0010-plugin-host-process.md).

## How plugins run

Your code runs in an **isolated host process** — never in the app's main process or UI. Everything you declare (labels, icons, config forms) lives in `manifest.json` and is rendered by the app itself; only *behavior* lives in your entry module. Every value crossing the boundary is schema-validated. Capabilities (`network`, `variables:read`, `variables:write`) are requested in the manifest and confirmed by the user at install; per-plugin key/value `storage` (200 keys × 1 MB) and `log` are always available.

## Package layout

```
my-plugin/
├── manifest.json
└── dist/index.cjs        # single bundled CommonJS file
```

Bundle with esbuild — no `node_modules` resolution is provided at load time:

```sh
esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs
```

Distribute the folder as-is, or zip its contents into a `.awbx` archive (manifest at the archive root). Limits: entries ≤ 20 MB, total ≤ 50 MB, ≤ 2000 entries, no symlinks or `..` paths.

## The manifest

```json
{
  "manifestVersion": 1,
  "id": "com.acme.tools",
  "name": "Acme Tools",
  "version": "1.0.0",
  "description": "Example contributions of every kind.",
  "main": "dist/index.cjs",
  "engines": { "sdk": "^1.0.0" },
  "capabilities": ["network"],
  "contributes": {
    "nodes": [{
      "kind": "uuid",
      "label": "Generate UUID",
      "icon": "hash",
      "configSchema": { "fields": [
        { "kind": "string", "key": "variable", "label": "Variable name", "required": true }
      ]}
    }],
    "requestTypes": [{
      "type": "echo",
      "label": "Echo",
      "payloadSchema": { "fields": [
        { "kind": "string", "key": "target", "label": "Target", "required": true },
        { "kind": "textarea", "key": "message", "label": "Message", "language": "json" }
      ]},
      "summary": { "badge": "ECHO", "targetKey": "target" }
    }],
    "authProviders": [{
      "type": "header-token",
      "label": "Header token",
      "configSchema": { "fields": [
        { "kind": "string", "key": "header", "label": "Header name", "default": "X-Api-Token" },
        { "kind": "secret", "key": "token", "label": "Token", "required": true }
      ]}
    }],
    "importers": [{
      "id": "csv",
      "label": "CSV endpoints",
      "sourceTypes": ["text"],
      "fileExtensions": [".csv"]
    }]
  }
}
```

Rules worth knowing:

- `id` is reverse-DNS style and is your permanent identity — the app namespaces every contribution as `plugin:<id>/<key>`.
- `engines.sdk` is a semver range checked against the app's SDK version before activation.
- Contribution keys (`kind`/`type`/`id`) match `[a-z][a-z0-9-]*`; ≤ 20 contributions per type; form schemas ≤ 40 fields.
- `icon` is a *named* lucide icon resolved against the app's allowlist (unknown names fall back to a puzzle piece).
- `signature` is reserved for future marketplace signing and ignored today.

### Form schemas

Field kinds: `string`, `textarea` (`language: 'text' | 'json'`), `number` (`min`/`max`/`integer`), `boolean`, `select` (`options`), `secret` (masked, encrypted at rest in credential configs), `keyvalue` (string→string grid). Common properties: `key`, `label`, `description`, `required`, `substituteVariables` (default `true` — set `false` on fields whose `{{ }}` braces must stay literal). Values are validated against the compiled schema **before** your code sees them.

## The entry module

```ts
import { definePlugin } from '@api-workbench/plugin-sdk';
import { randomUUID } from 'node:crypto';

export default definePlugin({
  async activate(ctx) {
    ctx.registerNodeExecutor('uuid', {
      async execute({ config }) {
        const variable = String(config.variable);
        return { variables: { [variable]: randomUUID() }, message: `${variable} set` };
      },
    });

    ctx.registerRequestType('echo', {
      async execute({ payload, artifacts }) {
        return {
          ok: true,
          summary: { label: 'ECHOED', tone: 'success', code: '0' },
          metadata: artifacts?.headers ?? {},
          body: String(payload.message ?? ''),
          bodyKind: 'json',
        };
      },
    });

    ctx.registerAuthProvider('header-token', {
      async apply({ config }) {
        return {
          headers: { [String(config.header)]: String(config.token) },
          query: {},
          cookies: {},
        };
      },
    });

    ctx.registerImporter('csv', {
      detect: (content) => content.startsWith('name,method,url'),
      async parse({ content }) {
        const rows = content.trim().split('\n').slice(1).map((l) => l.split(','));
        return {
          title: 'CSV import',
          version: '1.0',
          baseUrl: '',
          operations: rows.map(([name = '', method = 'GET', url = '']) => ({
            name, method: method.toUpperCase(), url, path: new URL(url).pathname, tag: null,
          })),
        };
      },
    });
  },
});
```

`activate()` must register **exactly** the contributions the manifest declares — a missing or undeclared registration fails activation. `deactivate()` is optional cleanup.

### The context (`ctx`)

| Member | Availability | Notes |
| --- | --- | --- |
| `pluginId`, `log` | always | log lines land in the app's structured log, tagged with your id |
| `storage` | always | per-plugin KV; 200 keys, 1 MB/value |
| `fetch` | `network` capability | `file:`/`app:` schemes blocked |
| `variables.resolve` | `variables:read` | substitutes `{{name}}` templates |
| `variables.set` | `variables:write` | workspace/global scopes |

### Extension-point contracts

- **NodeExecutor.execute({config, runtime, signal})** → `{message?, variables?, branch?}`. `runtime` is a read-only snapshot of the run's variable map; returned `variables` merge into it. `branch` routes labelled edges and is honored only when the contribution sets `branching: true`. Honor `signal` for cancellation.
- **RequestTypeProvider.execute({payload, artifacts?, options, signal})** → a `ProtocolResult` (`ok`, `summary` chip, `metadata` map, `body`, optional `protocol` extras). Apply `artifacts.headers` wherever your protocol has a header/metadata concept. `payload` arrives variable-substituted per your form schema.
- **AuthProvider.apply({config, ctx})** → `AuthArtifacts` (`headers`/`query`/`cookies`). `ctx.method`/`ctx.body` are absent for non-HTTP request types.
- **Importer.detect(content)** must be cheap and never throw; **parse({content, signal})** returns an `ImportedCollection` the app turns into a collection (operations grouped into folders by `tag`).

## Install & develop

- **Users:** Plugins page → Install → pick the `.awbx`/folder → review the requested capabilities → confirm.
- **Authors:** Plugins page → *Load unpacked* with your working directory. Files load in place (nothing is copied); after an edit, rebuild your bundle and toggle the plugin off/on to re-activate. `plugins/examples/` in the repository contains one working plugin per extension point, used by the integration tests.

## Versioning promise

The SDK is a public semver contract (ADR-0007): additive changes bump the minor version and your `^1.0.0` range keeps working; breaking changes bump the major and are documented in release notes. Report gaps via the repository issue tracker.
