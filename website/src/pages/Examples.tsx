import { Code2, ExternalLink } from 'lucide-react';
import { GithubIcon } from '../components/Icon';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { PageHeader } from '../components/PageHeader';
import { Stagger, StaggerItem, Reveal } from '../components/Reveal';
import { AppMockup } from '../components/Mockups';
import { Button } from '../components/ui';
import { cn } from '../lib/utils';
import { exampleProjects, type Difficulty } from '../data/examples';

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  Beginner: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  Intermediate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  Advanced: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
};

export default function Examples() {
  return (
    <>
      <Seo title="Examples" description="Eight real example plugins shipped in the API Workbench repository — one per extension point, from a minimal UUID node to a live interactive protocol client." path="/examples" />
      <PageHeader
        eyebrow="Learn by example"
        title="Example plugins"
        lede="These eight plugins live in the repository under plugins/examples/ and double as integration-test fixtures — they are guaranteed to work with every release."
      >
        <Button href={`${site.repoUrl}/tree/master/plugins/examples`} variant="secondary">
          <GithubIcon size={16} /> Browse all on GitHub
        </Button>
      </PageHeader>

      <div className="mx-auto max-w-7xl px-6 pb-24">
        <Stagger className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {exampleProjects.map((example) => (
            <StaggerItem key={example.slug} className="h-full">
              <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-card transition-all hover:-translate-y-1 hover:border-brand-400/50 hover:shadow-glow dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-card-dark">
                <div className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
                  <div className="transition-transform duration-500 group-hover:scale-[1.04]">
                    <AppMockup kind={example.mockup} aspect="aspect-[16/8]" className="rounded-none border-0 shadow-none" />
                  </div>
                  <span className={cn('absolute left-3 top-3 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', DIFFICULTY_STYLES[example.difficulty])}>
                    {example.difficulty}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{example.title}</h2>
                    <span className="mt-1 shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-300">
                      {example.extensionPoint}
                    </span>
                  </div>
                  <p className="mt-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{example.description}</p>
                  <ul className="mt-4 space-y-1.5">
                    {example.highlights.map((h) => (
                      <li key={h} className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <Code2 size={12} className="shrink-0 text-brand-400" aria-hidden />
                        <code className="font-mono">{h}</code>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex gap-2">
                    <a
                      href={example.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      <GithubIcon size={13} /> View source
                    </a>
                    <a
                      href={`${site.repoUrl}/archive/refs/heads/master.zip`}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 text-xs font-semibold text-zinc-700 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-zinc-700 dark:text-zinc-200"
                    >
                      <ExternalLink size={13} /> Download repo
                    </a>
                  </div>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-16 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">
            Ready to build your own? The Quick Start walks you from empty folder to installed plugin.
          </p>
          <div className="mt-5">
            <Button to="/plugins/quick-start">Plugin Quick Start</Button>
          </div>
        </Reveal>
      </div>
    </>
  );
}
