import { Bug, PackagePlus, Sparkles, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Seo } from '../lib/seo';
import { PageHeader } from '../components/PageHeader';
import { Reveal } from '../components/Reveal';
import { cn } from '../lib/utils';
import { changelog } from '../data/changelog';

function Group({ title, icon, tone, items }: { title: string; icon: ReactNode; tone: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-5">
      <p className={cn('flex items-center gap-2 text-sm font-semibold', tone)}>
        {icon}
        {title}
      </p>
      <ul className="mt-2 space-y-1.5 pl-1">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Changelog() {
  return (
    <>
      <Seo title="Changelog" description="Release notes for API Workbench, grouped by version: new features, improvements, bug fixes, and breaking changes." path="/changelog" />
      <PageHeader eyebrow="Release notes" title="Changelog" lede="Every milestone, grouped by version. Subscribe via the RSS feed in the footer to follow along." />

      <div className="mx-auto max-w-3xl px-6 pb-24">
        <ol className="relative space-y-10 border-l border-zinc-200 pl-8 dark:border-zinc-800">
          {changelog.map((entry, i) => (
            <Reveal key={entry.version} delay={Math.min(i * 0.05, 0.25)}>
              <li className="relative">
                <span
                  className={cn(
                    'absolute -left-[41px] top-6 h-3.5 w-3.5 rounded-full ring-4 ring-zinc-50 dark:ring-[#09090c]',
                    i === 0 ? 'bg-brand-500 shadow-lg shadow-brand-500/50' : 'bg-zinc-300 dark:bg-zinc-700'
                  )}
                  aria-hidden
                />
                <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={cn('rounded-full px-3 py-1 font-mono text-sm font-bold', i === 0 ? 'bg-brand-500 text-white' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200')}>
                      {entry.version}
                    </span>
                    <span className="text-sm text-zinc-400">{entry.date}</span>
                    {i === 0 && (
                      <span className="rounded-full border border-brand-400/40 bg-brand-500/10 px-2.5 py-0.5 text-xs font-medium text-brand-500 dark:text-brand-300">
                        Latest
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-zinc-900 dark:text-zinc-50">{entry.title}</h2>
                  <Group title="New features" icon={<Sparkles size={15} />} tone="text-emerald-600 dark:text-emerald-400" items={entry.features} />
                  <Group title="Improvements" icon={<PackagePlus size={15} />} tone="text-sky-600 dark:text-sky-400" items={entry.improvements} />
                  <Group title="Bug fixes" icon={<Bug size={15} />} tone="text-amber-600 dark:text-amber-400" items={entry.fixes} />
                  <Group title="Breaking changes" icon={<TriangleAlert size={15} />} tone="text-red-600 dark:text-red-400" items={entry.breaking} />
                </article>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </>
  );
}
