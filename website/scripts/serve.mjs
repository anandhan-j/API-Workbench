/**
 * Minimal static server for sharing the production build (e.g. via a tunnel).
 * Mirrors GitHub Pages behavior better than `vite preview`:
 *   - `/` and `/API-Workbench` redirect to `/API-Workbench/`
 *   - unknown paths under the base fall back to index.html (SPA deep links)
 * Usage: node scripts/serve.mjs [port]   (default 4173)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = '/API-Workbench';
const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const PORT = Number(process.argv[2] ?? 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);

  if (path === '/' || path === BASE) {
    res.writeHead(302, { Location: `${BASE}/${url.search}` });
    return res.end();
  }
  if (!path.startsWith(`${BASE}/`)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end(`Not found. This site is served at ${BASE}/`);
  }

  let rel = path.slice(BASE.length + 1) || 'index.html';
  // Prevent path traversal
  rel = normalize(rel).replace(/^([.][.][/\\])+/, '');

  const tryFiles = rel.includes('.') ? [rel] : [rel, 'index.html'];
  for (const candidate of tryFiles) {
    try {
      const body = await readFile(join(DIST, candidate));
      res.writeHead(200, { 'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream' });
      return res.end(body);
    } catch {
      /* try next */
    }
  }
  // SPA fallback for extension-less routes that missed above, else real 404
  try {
    const body = await readFile(join(DIST, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Serving dist at http://localhost:${PORT}${BASE}/`);
});
