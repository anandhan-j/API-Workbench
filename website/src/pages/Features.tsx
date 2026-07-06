import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Seo } from '../lib/seo';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { cn } from '../lib/utils';
import { featureCategories, features, type Feature } from '../data/features';

type FilterKey = Feature['category'] | 'all';

export default function Features() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const visible = filter === 'all' ? features : features.filter((f) => f.category === filter);

  return (
    <>
      <Seo title="Features" description={`All ${features.length} features of API Workbench: OpenAPI sync, multi-protocol execution, workflows, plugins, and a hardened offline-first platform.`} path="/features" />
      <PageHeader
        eyebrow={`${features.length} features and counting`}
        title="Everything a serious API workflow needs"
        lede="From spec-linked collections to sandboxed plugins — each feature below ships today, built phase by phase with tests and docs."
      />

      <div className="mx-auto max-w-7xl px-6 pb-24">
        {/* Category filter */}
        <div className="mb-10 flex flex-wrap justify-center gap-2" role="group" aria-label="Filter features by category">
          {([{ key: 'all' as const, label: 'All' }, ...featureCategories] as Array<{ key: FilterKey; label: string }>).map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setFilter(cat.key)}
              aria-pressed={filter === cat.key}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                filter === cat.key
                  ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                  : 'border-zinc-300 text-zinc-600 hover:border-brand-400 hover:text-brand-500 dark:border-zinc-700 dark:text-zinc-300'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visible.map((f) => (
              <motion.article
                key={f.title}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.3 }}
                whileHover={{ y: -4 }}
                className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-card transition-colors hover:border-brand-400/50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-card-dark dark:hover:border-brand-500/40"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-accent-400/15 text-brand-500 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 dark:text-brand-300">
                    <Icon name={f.icon} size={21} />
                  </span>
                  <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                    {featureCategories.find((c) => c.key === f.category)?.label}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{f.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{f.description}</p>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
