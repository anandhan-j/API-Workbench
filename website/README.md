# API Workbench — Website

The documentation and marketing website for [API Workbench](https://github.com/anandhan-j/API-Workbench), deployed to GitHub Pages at **https://anandhan-j.github.io/API-Workbench/**.

Built with Vite + React 18 + TypeScript, Tailwind CSS, [Motion](https://motion.dev) (Framer Motion), and lucide-react. No backend — fully static, offline-buildable, with live GitHub stats fetched client-side (graceful fallback when offline/rate-limited).

## Development

```bash
cd website
npm install
npm run dev        # http://localhost:5173/API-Workbench/
npm run build      # typecheck + production build → dist/
npm run preview    # serve the production build locally
```

> This folder is intentionally **not** part of the repo's npm workspaces — it has its own lockfile and installs independently, so the Electron app's native-module toolchain never interferes with the website build.

## Deployment

Pushing changes under `website/` to `master` triggers `.github/workflows/deploy-website.yml`, which builds and publishes to GitHub Pages.

One-time repo setup: **Settings → Pages → Source: GitHub Actions.**

- The site is served from `/API-Workbench/`; the base path is set in `vite.config.ts` (override with `VITE_BASE=/` for a custom domain).
- Deep links work on Pages via the `public/404.html` SPA-redirect technique paired with the restore script in `index.html`.

## Project structure

```
website/
├─ public/               # static assets: favicon, og-image, 404.html, robots.txt,
│                        # sitemap.xml, rss.xml, manifest.webmanifest
├─ src/
│  ├─ lib/               # site constants, theme, SEO, GitHub API, syntax highlighter
│  ├─ components/        # Navbar, Footer, CodeBlock, Tabs, Accordion, Lightbox,
│  │                     # CommandPalette (Ctrl+K), Mockups (CSS-drawn app screenshots)…
│  ├─ data/              # features, roadmap, changelog, gallery, examples, FAQ, downloads
│  ├─ docs/              # typed block-based docs engine
│  │  ├─ content/app.ts      # main documentation (15 pages)
│  │  ├─ content/plugins.ts  # Plugin SDK documentation (19 pages)
│  │  └─ registry.ts         # nav, prev/next, search index
│  └─ pages/             # one component per route
└─ .github/workflows/deploy-website.yml   (at repo root)
```

## Editing content

- **Docs pages** live in `src/docs/content/*.ts` as typed block arrays (`p`, `h2`, `code`, `callout`, `table`, `tabs`, `ul`, `mockup`…). Adding a page there automatically adds it to the sidebar, search index, and prev/next chain.
- **Feature/roadmap/changelog/FAQ** content is plain data in `src/data/`.
- **Site-wide constants** (repo URL, version, nav) are in `src/lib/site.ts`.

## Replacing placeholder screenshots

All "screenshots" are CSS-drawn mockups rendered by `src/components/Mockups.tsx` (`<AppMockup kind="requests" />` etc.), so they stay crisp at any size and match both themes. To swap in real captures, replace any `<AppMockup …>` usage with an `<img>` — page layouts don't depend on the mockup internals.
