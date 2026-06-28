# Getting Started

This guide gets the API Workbench desktop application running on your machine. It covers the Phase 1 application shell: the layout, theming, structured logging, and the live dispatch monitor.

## Prerequisites

You need Node.js 20 or newer and npm 10 or newer. The desktop app is built on Electron, so the first install downloads an Electron binary for your platform; this requires network access to GitHub release assets.

## Install

The project is an npm-workspaces monorepo. Install from the repository root:

```bash
npm install
```

This installs dependencies for every workspace, including the desktop app under `apps/desktop`.

## Run in development

```bash
npm run dev
```

This launches `electron-vite` in development mode: the React renderer is served with hot-module replacement, and the Electron main process loads it. The application window opens with the sidebar, tab bar, the dispatch monitor docked at the bottom, and the status bar. Edits to renderer code reload instantly; changes to main or preload code restart the Electron process.

## Build and preview

```bash
npm run build      # type-checks, then builds main, preload, and renderer
npm run start      # previews the production build in Electron
```

The build output is written to `apps/desktop/out`. Packaging into installers (Windows, macOS, Linux) is delivered in Phase 18.

## Quality gates

```bash
npm run typecheck      # tsc across node (main/preload) and web (renderer) projects
npm run lint           # ESLint, zero warnings allowed
npm run test           # Vitest unit + component tests
npm run test:coverage  # Vitest with V8 coverage
npm run format         # Prettier write
```

## What you should see

On launch the Home screen names the running app and version. The left sidebar navigates between Home, the Dispatch Monitor, and Settings, and can be collapsed. The bottom status bar shows the bridge connection state, runtime versions, a live event counter, and a theme toggle. The docked Dispatch Monitor streams structured log/dispatch events from the main process in real time, with level filtering, pause, and clear. Settings lets you switch between light and dark themes and toggle the monitor.

## Project layout

Source lives under `apps/desktop/src`, split by Electron process boundary into `main` (privileged), `preload` (the context-bridge), `renderer` (the sandboxed React UI), and `shared` (the typed IPC contract used by both sides). See the [Folder Structure](../architecture/FOLDER_STRUCTURE.md) and [Architecture Overview](../architecture/ARCHITECTURE.md) for the full picture, and the [Phase 1 notes](../PHASE_1.md) for what this milestone delivers and the decisions behind it.

## Troubleshooting

If `npm install` is slow or stalls while resolving the dependency graph, run it with `npm install --prefer-offline` to use the local cache and skip slow revalidation. If the Electron binary fails to download behind a proxy, set the appropriate `ELECTRON_MIRROR`/`HTTPS_PROXY` environment variables and re-run `npm install`.
