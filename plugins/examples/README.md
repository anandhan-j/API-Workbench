# Example plugins

One working plugin per Phase 16 extension point, authored exactly as the
[Plugin SDK guide](../../docs/guides/PLUGIN_SDK.md) prescribes and consumed by
the desktop app's plugin integration tests as fixtures:

| Plugin | Extension point | What it does |
| --- | --- | --- |
| [uuid-node](./uuid-node) | Workflow node | Writes a random UUID into a runtime variable |
| [user-input-node](./user-input-node) | Workflow node | Captures named values and merges them into the run's runtime variables (plugin analogue of the built-in *User input* node) |
| [echo-request-type](./echo-request-type) | Request type | Loopback protocol echoing its payload (and auth headers) back |
| [header-token-auth](./header-token-auth) | Auth provider | Sends a secret token in a configurable header |
| [csv-importer](./csv-importer) | Importer | Builds a collection from `name,method,url,folder` CSV rows |

Build all bundles (esbuild, single CJS file each):

```sh
npm run build:example-plugins --workspace @api-workbench/desktop
```

Then install any of them from the app's **Plugins** page — pick the example's
folder, or use *Load unpacked* while developing.
