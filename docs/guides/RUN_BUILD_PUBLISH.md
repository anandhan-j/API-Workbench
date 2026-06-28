# Run, Debug, Build & Publish

Operational guide for the API Workbench desktop app (`apps/desktop`). Covers running in development, debugging the Electron main and renderer processes, producing a production build, packaging a Windows `.exe`, and publishing with auto-update. All commands run from the repository root unless noted.

## Prerequisites

Node.js 20+ and npm 10+. The first install downloads an Electron binary for your platform, which needs network access to GitHub release assets. On Windows, building NSIS installers works out of the box; building for macOS targets requires a macOS host.

Install dependencies once:

```bash
npm install
```

## Run (development)

```bash
npm run dev
```

This starts `electron-vite` in dev mode: the renderer is served by Vite with hot-module replacement, and Electron loads it via the `ELECTRON_RENDERER_URL` env var. Renderer edits hot-reload; edits to `main` or `preload` restart the Electron process automatically. The window opens with the sidebar, tabs, docked dispatch monitor, and status bar.

Run only the renderer in a plain browser (no Electron, bridge shows as "Offline") for quick UI work:

```bash
npm run dev --workspace @api-workbench/desktop -- --renderer-only
```

## Debug

The app has two processes; each is debugged differently.

**Renderer (React UI).** Open DevTools in the running app with `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS). Use the Elements, Console, Network, and React DevTools tabs as in any web app. Source maps are emitted in dev so breakpoints map to your `.tsx` source.

**Main process (Node).** The main process runs under Node and is debugged with an inspector. Start it with debugging enabled:

```bash
# from apps/desktop
npx electron-vite dev --inspect=5858
```

Then attach a debugger to `localhost:5858` — either Chrome at `chrome://inspect` or your editor's "Attach to Node" configuration pointed at port 5858. Breakpoints in `src/main/**` and `src/preload/**` will hit.

**VS Code one-click.** Add `.vscode/launch.json` with a compound config that runs the dev server and attaches to both processes:

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main",
      "type": "node",
      "request": "attach",
      "port": 5858,
      "restart": true,
      "sourceMaps": true,
      "cwd": "${workspaceFolder}/apps/desktop"
    }
  ]
}
```

Run `npx electron-vite dev --inspect=5858` in a terminal, then launch "Debug Main".

**Logs / dispatch monitor.** The structured main-process logger prints JSON lines to the terminal and streams every event into the in-app Dispatch Monitor (docked panel, toggled from the status bar). Use it to trace IPC calls, navigation blocks, and errors live. Secret-looking fields are redacted automatically.

## Quality gates (before building)

```bash
npm run typecheck   # tsc: node (main/preload) + web (renderer)
npm run lint        # ESLint, zero warnings
npm run test        # Vitest unit + component tests
```

## Build (production assets)

```bash
npm run build
```

This type-checks, then runs `electron-vite build`, compiling `main`, `preload`, and `renderer` into `apps/desktop/out/`. Preview the built app in Electron without packaging:

```bash
npm run start       # = electron-vite preview
```

The `out/` directory is the input to packaging — it is not itself a distributable installer.

## Package as `.exe` (and other installers)

Packaging uses **electron-builder**, which wraps the built `out/` assets into platform installers. This is formally delivered in Phase 18; the steps below enable it.

1. Add the electron-builder config at `apps/desktop/electron-builder.yml`:

```yaml
appId: com.apiworkbench.app
productName: API Workbench
directories:
  output: release/${version}
  buildResources: build
files:
  - out/**/*
  - package.json
win:
  target:
    - nsis        # installer .exe
    - portable    # single portable .exe
  artifactName: ${productName}-${version}-${arch}.${ext}
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
mac:
  target: dmg
  category: public.app-category.developer-tools
linux:
  target:
    - AppImage
    - deb
```

2. Add packaging scripts to `apps/desktop/package.json`:

```jsonc
{
  "scripts": {
    "package": "npm run build && electron-builder --config electron-builder.yml",
    "package:win": "npm run build && electron-builder --win --config electron-builder.yml",
    "package:mac": "npm run build && electron-builder --mac --config electron-builder.yml",
    "package:linux": "npm run build && electron-builder --linux --config electron-builder.yml"
  }
}
```

3. Produce the Windows installer and portable `.exe`:

```bash
npm run package:win --workspace @api-workbench/desktop
```

The artifacts are written to `apps/desktop/release/<version>/` — an NSIS installer `.exe` (lets the user choose the install directory) and a single-file portable `.exe`. Build Windows targets on a Windows host (or a Windows CI runner); cross-building Windows installers from Linux/macOS is unreliable for native bits and code signing.

**Code signing (recommended for distribution).** Set these before packaging so the `.exe` is signed and avoids SmartScreen warnings:

```bash
# Windows code signing certificate (.pfx)
set CSC_LINK=path\to\certificate.pfx
set CSC_KEY_PASSWORD=your-cert-password
```

On macOS use `CSC_LINK`/`CSC_KEY_PASSWORD` with an Apple Developer ID certificate plus notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

## Publish (releases + auto-update)

The app already depends on `electron-updater`. To publish installers and enable in-app auto-update:

1. Add a `publish` block to `electron-builder.yml` (GitHub Releases shown; S3, generic HTTP server, and others are supported):

```yaml
publish:
  provider: github
  owner: your-org
  repo: api-workbench
```

2. Provide a token with release permissions and publish:

```bash
set GH_TOKEN=your-github-token
npm run package:win --workspace @api-workbench/desktop -- --publish always
```

`--publish always` uploads the installers and the `latest.yml` update manifest to a release. Wire `electron-updater` in the main process (`autoUpdater.checkForUpdatesAndNotify()`) so installed clients pick up new versions automatically. Full hardening — signed updates, staged rollout, and crash reporting — is part of Phase 18.

## Quick reference

| Task | Command |
| --- | --- |
| Run (dev, HMR) | `npm run dev` |
| Debug main process | `npx electron-vite dev --inspect=5858` then attach to `:5858` |
| Debug renderer | `Ctrl/Cmd+Shift+I` in the app window |
| Type-check / lint / test | `npm run typecheck` · `npm run lint` · `npm run test` |
| Build assets | `npm run build` |
| Preview build | `npm run start` |
| Windows `.exe` | `npm run package:win --workspace @api-workbench/desktop` |
| All platforms | `npm run package --workspace @api-workbench/desktop` |
| Publish + auto-update | `... package:win -- --publish always` (with `GH_TOKEN`) |
