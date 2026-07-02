# @api-workbench/plugin-sdk

The public, semantically versioned contract for building API Workbench plugins
(ADR-0007). A plugin can contribute **custom workflow nodes**, **custom request
types**, **custom auth providers**, and **custom importers** — without forking
or importing the core.

This package is **types-only** plus the `definePlugin` identity helper: your
plugin compiles against it, but the desktop app validates everything you
declare with its own schemas at install/activation time. Current SDK version:
`1.0.0` — declare compatibility in your manifest with `"engines": { "sdk": "^1.0.0" }`.

## Anatomy of a plugin

```
my-plugin/
├── manifest.json        # identity, SDK range, capabilities, contributions
└── dist/index.cjs       # bundled CommonJS entry (esbuild --bundle)
```

`manifest.json`:

```json
{
  "manifestVersion": 1,
  "id": "com.acme.uuid-tools",
  "name": "UUID Tools",
  "version": "1.0.0",
  "main": "dist/index.cjs",
  "engines": { "sdk": "^1.0.0" },
  "capabilities": [],
  "contributes": {
    "nodes": [
      {
        "kind": "uuid",
        "label": "Generate UUID",
        "icon": "hash",
        "configSchema": {
          "fields": [
            { "kind": "string", "key": "variable", "label": "Variable name", "required": true }
          ]
        }
      }
    ]
  }
}
```

`src/index.ts`:

```ts
import { definePlugin } from '@api-workbench/plugin-sdk';
import { randomUUID } from 'node:crypto';

export default definePlugin({
  activate(ctx) {
    ctx.registerNodeExecutor('uuid', {
      async execute({ config }) {
        const variable = String(config.variable);
        return { variables: { [variable]: randomUUID() }, message: `${variable} = uuid` };
      },
    });
  },
});
```

Bundle to a single CJS file (no `node_modules` resolution is provided at load
time):

```sh
esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.cjs
```

## Rules of the road

- **Declare before you register.** `activate()` must register exactly the
  contributions the manifest declares; anything else fails activation.
- **Capabilities are opt-in.** `ctx.fetch` and `ctx.variables` exist only when
  the user granted the matching capability at install. Per-plugin `ctx.storage`
  and `ctx.log` are always available.
- **Your code runs isolated.** Plugins execute in a dedicated host process with
  no access to the app's database, secrets, or windows; every value you return
  is schema-validated by the host before use.
- **UI is declarative.** Labels, icons, and config forms come from the manifest
  (`FormSchema`); plugins never ship UI code.

See the desktop repository's `docs/guides/PLUGIN_SDK.md` for the full guide and
`plugins/examples/` for a working example of each extension point.
