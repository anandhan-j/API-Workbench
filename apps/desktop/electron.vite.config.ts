import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // The plugin host runs as a utility process (ADR-0010): its own
          // entry bundle, forked by the main process at runtime.
          'plugin-host': resolve(__dirname, 'src/plugin-host/index.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main'),
      },
    },
  },
  preload: {
    // NOTE: the preload runs in a sandboxed renderer (sandbox: true), where it
    // cannot `require()` external npm modules at runtime. So we do NOT externalize
    // dependencies here — everything the preload imports (e.g. the IPC contract and
    // its `zod` schemas) is bundled into the preload output. Only `electron` itself
    // stays external, since the sandbox provides it.
    //
    // electron-vite v5 enables `externalizeDeps` by default for main *and* preload,
    // which would emit `require("zod")` and fail to load in the sandbox — so we must
    // explicitly turn it off here.
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        external: ['electron'],
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer/src'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
});
