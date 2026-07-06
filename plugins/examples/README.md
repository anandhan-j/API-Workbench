# Example plugins

One working plugin per Phase 16 extension point, authored exactly as the
[Plugin SDK guide](../../docs/guides/PLUGIN_SDK.md) prescribes and consumed by
the desktop app's plugin integration tests as fixtures:

| Plugin | Extension point | What it does |
| --- | --- | --- |
| [uuid-node](./uuid-node) | Workflow node | Writes a random UUID into a runtime variable |
| [user-input-node](./user-input-node) | Workflow node | Prompts with one field per prompt kind — text, secret, preset dropdown (`options`), preset key-value (`entries`), run-time list (`filledAtRuntime`) — and merges the values into the run's runtime variables (plugin analogue of the built-in *User input* node) |
| [pick-item-node](./pick-item-node) | Workflow node | Picks one item from a configurable `list` field (first/last/random/by index via a `select` field) into a runtime variable, optionally exposing the full list as a JSON-array variable |
| [approval-dialog-node](./approval-dialog-node) | Workflow node | Gates the run behind a plugin-requested dialog (`ctx.ui.showDialog`, `ui:dialog` capability): approve/reject + comment |
| [dropdown-dialog-node](./dropdown-dialog-node) | Workflow node | Turns a `keyvalue` config grid and a `list` field into dropdowns inside one runtime dialog and stores the selections in variables — an extensibility exercise using only the public SDK |
| [echo-request-type](./echo-request-type) | Request type | Loopback protocol echoing its payload (and auth headers) back |
| [interactive-echo](./interactive-echo) | Request type (interactive) | A live session (`interactive: true`, `openConnection`) that echoes each message you send |
| [header-token-auth](./header-token-auth) | Auth provider | Sends a secret token in a configurable header |
| [csv-importer](./csv-importer) | Importer | Builds a collection from `name,method,url,folder` CSV rows |

Build all bundles (esbuild, single CJS file each):

```sh
npm run build:example-plugins --workspace @api-workbench/desktop
```

Then install any of them from the app's **Plugins** page — pick the example's
folder, or use *Load unpacked* while developing.
