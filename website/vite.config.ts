import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed to GitHub Pages at https://anandhan-j.github.io/API-Workbench/.
// Override with VITE_BASE=/ for a custom domain or local static preview.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/API-Workbench/',
  plugins: [react()],
  // Allow tunnel hosts (e.g. cloudflared quick tunnels) when sharing a build.
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['motion'],
        },
      },
    },
  },
});
