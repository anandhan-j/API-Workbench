import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, ChevronRight, ListFilter, X } from 'lucide-react';
import { Seo } from '../lib/seo';
import { cn } from '../lib/utils';
import { docSets, findPage, prevNext } from '../docs/registry';
import { renderBlocks, slugify } from '../docs/render';
import type { DocSet } from '../docs/types';
import NotFound from './NotFound';

function Sidebar({ set, activeSlug, filter, onFilter }: { set: DocSet; activeSlug: string; filter: string; onFilter: (v: string) => void }) {
  const q = filter.trim().toLowerCase();
  return (
    <nav aria-label={`${set.title} navigation`} className="space-y-6">
      <label className="relative block">
        <ListFilter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="Filter pages…"
          aria-label="Filter documentation pages"
          className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-brand-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
        />
      </label>
      {set.sections.map((section) => {
        const pages = q ? section.pages.filter((p) => `${p.title} ${p.description}`.toLowerCase().includes(q)) : section.pages;
        if (pages.length === 0) return null;
        return (
          <div key={section.title}>
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{section.title}</p>
            <ul className="space-y-0.5 border-l border-zinc-200 dark:border-zinc-800">
              {pages.map((page) => {
                const active = page.slug === activeSlug;
                return (
                  <li key={page.slug}>
                    <Link
                      to={`${set.basePath}/${page.slug}`}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        '-ml-px block border-l-2 py-1.5 pl-4 pr-2 text-sm transition-colors',
                        active
                          ? 'border-brand-500 font-semibold text-brand-600 dark:text-brand-300'
                          : 'border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100'
                      )}
                    >
                      {page.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export default function DocsPage({ basePath }: { basePath: string }) {
  const { slug } = useParams();
  const [filter, setFilter] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  const set = docSets.find((s) => s.basePath === basePath)!;
  const page = findPage(basePath, slug);

  useEffect(() => {
    setMobileNav(false);
    window.scrollTo({ top: 0 });
  }, [slug, basePath]);

  const toc = useMemo(
    () => (page ? page.blocks.filter((b) => b.kind === 'h2').map((b) => (b.kind === 'h2' ? b.text : '')) : []),
    [page]
  );

  if (!page) return <NotFound />;

  const { prev, next } = prevNext(basePath, page.slug);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6">
      <Seo title={`${page.title} — ${set.title}`} description={page.description} path={page.path} />

      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setMobileNav(true)}
        className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-300 lg:hidden"
      >
        <ListFilter size={15} /> {set.title} menu
      </button>

      <AnimatePresence>
        {mobileNav && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileNav(false)}
          >
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="thin-scroll h-full w-80 max-w-[85vw] overflow-y-auto bg-white p-5 dark:bg-zinc-950"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-bold text-zinc-900 dark:text-white">{set.title}</p>
                <button type="button" aria-label="Close menu" onClick={() => setMobileNav(false)} className="text-zinc-500">
                  <X size={18} />
                </button>
              </div>
              <Sidebar set={set} activeSlug={page.slug} filter={filter} onFilter={setFilter} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)_190px] lg:gap-10 xl:gap-14">
        {/* Desktop sidebar */}
        <aside className="thin-scroll sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto pb-6 lg:block">
          <Sidebar set={set} activeSlug={page.slug} filter={filter} onFilter={setFilter} />
        </aside>

        {/* Content */}
        <motion.article
          key={page.path}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="min-w-0"
        >
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            <Link to="/" className="hover:text-brand-500">
              Home
            </Link>
            <ChevronRight size={13} aria-hidden />
            <Link to={set.basePath} className="hover:text-brand-500">
              {set.title}
            </Link>
            <ChevronRight size={13} aria-hidden />
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{page.title}</span>
          </nav>

          <p className="text-sm font-semibold uppercase tracking-widest text-brand-500 dark:text-brand-400">{page.sectionTitle}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">{page.title}</h1>
          <p className="mt-3 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">{page.description}</p>

          <div className="doc-prose mt-8">{renderBlocks(page.blocks)}</div>

          {/* Prev / next */}
          <nav aria-label="Pagination" className="mt-14 grid gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800 sm:grid-cols-2">
            {prev ? (
              <Link
                to={prev.path}
                className="group rounded-xl border border-zinc-200 p-4 transition-colors hover:border-brand-400/60 dark:border-zinc-800"
              >
                <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <ArrowLeft size={12} /> Previous
                </span>
                <span className="mt-1 block font-semibold text-zinc-800 group-hover:text-brand-500 dark:text-zinc-100">{prev.title}</span>
              </Link>
            ) : (
              <span aria-hidden />
            )}
            {next && (
              <Link
                to={next.path}
                className="group rounded-xl border border-zinc-200 p-4 text-right transition-colors hover:border-brand-400/60 dark:border-zinc-800"
              >
                <span className="flex items-center justify-end gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Next <ArrowRight size={12} />
                </span>
                <span className="mt-1 block font-semibold text-zinc-800 group-hover:text-brand-500 dark:text-zinc-100">{next.title}</span>
              </Link>
            )}
          </nav>
        </motion.article>

        {/* On-page TOC */}
        <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] self-start lg:block">
          {toc.length > 0 && (
            <>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">On this page</p>
              <ul className="space-y-2 border-l border-zinc-200 text-sm dark:border-zinc-800">
                {toc.map((heading) => (
                  <li key={heading}>
                    <a
                      href={`#${slugify(heading)}`}
                      className="-ml-px block border-l-2 border-transparent pl-3 text-zinc-500 transition-colors hover:border-brand-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      {heading}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
