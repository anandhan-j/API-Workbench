import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Maximize2 } from 'lucide-react';
import { Seo } from '../lib/seo';
import { PageHeader } from '../components/PageHeader';
import { AppMockup } from '../components/Mockups';
import { Lightbox } from '../components/Lightbox';
import { cn } from '../lib/utils';
import { galleryCategories, galleryItems, type GalleryCategory, type GalleryItem } from '../data/gallery';

type Filter = GalleryCategory | 'All';

export default function Gallery() {
  const [filter, setFilter] = useState<Filter>('All');
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const visible = filter === 'All' ? galleryItems : galleryItems.filter((g) => g.category === filter);

  return (
    <>
      <Seo title="Gallery" description="A visual tour of API Workbench: request editor, workflow designer, plugin manager, settings, themes, and run logs." path="/gallery" />
      <PageHeader eyebrow="Visual tour" title="Gallery" lede="Browse the interface by area. Click any card for a full-size preview. (Rendered mockups — drop in real captures anytime.)" />

      <div className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-10 flex flex-wrap justify-center gap-2" role="group" aria-label="Filter gallery by category">
          {(['All', ...galleryCategories] as Filter[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              aria-pressed={filter === cat}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                filter === cat
                  ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                  : 'border-zinc-300 text-zinc-600 hover:border-brand-400 hover:text-brand-500 dark:border-zinc-700 dark:text-zinc-300'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <motion.div layout className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visible.map((item) => (
              <motion.figure
                key={item.title}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.3 }}
                className="group cursor-zoom-in"
                onClick={() => setSelected(item)}
              >
                <div className="relative overflow-hidden rounded-2xl border border-zinc-200 shadow-card transition-all duration-300 group-hover:border-brand-400/60 group-hover:shadow-glow dark:border-zinc-800 dark:shadow-card-dark">
                  <div className="transition-transform duration-500 ease-out group-hover:scale-[1.04]">
                    <AppMockup kind={item.kind} tone={item.tone ?? 'dark'} className="rounded-none border-0 shadow-none" />
                  </div>
                  <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100" aria-hidden>
                    <Maximize2 size={14} />
                  </span>
                </div>
                <figcaption className="mt-3 flex items-start justify-between gap-3 px-1">
                  <span>
                    <span className="block font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">{item.caption}</span>
                  </span>
                  <span className="mt-0.5 shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:border-zinc-700">
                    {item.category}
                  </span>
                </figcaption>
              </motion.figure>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      <Lightbox open={selected !== null} onClose={() => setSelected(null)} title={selected?.title} caption={selected?.caption}>
        {selected && <AppMockup kind={selected.kind} tone={selected.tone ?? 'dark'} />}
      </Lightbox>
    </>
  );
}
