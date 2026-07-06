import { motion } from 'motion/react';
import { CheckCircle2, CircleDashed, Clock3, Telescope } from 'lucide-react';
import type { ReactNode } from 'react';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { PageHeader } from '../components/PageHeader';
import { Reveal } from '../components/Reveal';
import { Button } from '../components/ui';
import { cn } from '../lib/utils';
import { roadmap, type PhaseStatus } from '../data/roadmap';

const STATUS: Record<PhaseStatus, { label: string; icon: ReactNode; chip: string; dot: string }> = {
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 size={14} />,
    chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500 shadow-emerald-500/40',
  },
  'in-progress': {
    label: 'In progress',
    icon: <Clock3 size={14} />,
    chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    dot: 'bg-amber-500 shadow-amber-500/40 animate-pulse',
  },
  planned: {
    label: 'Planned',
    icon: <CircleDashed size={14} />,
    chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    dot: 'bg-sky-500 shadow-sky-500/40',
  },
  future: {
    label: 'Future',
    icon: <Telescope size={14} />,
    chip: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/30',
    dot: 'bg-zinc-400 shadow-zinc-400/40',
  },
};

export default function Roadmap() {
  const done = roadmap.filter((p) => p.status === 'completed').length;

  return (
    <>
      <Seo title="Roadmap" description={`The 20-phase delivery roadmap of API Workbench — ${done} phases complete, from project foundation to documentation and release.`} path="/roadmap" />
      <PageHeader
        eyebrow={`${done} of ${roadmap.length} phases complete`}
        title="Roadmap"
        lede="API Workbench is delivered phase by phase: each phase ships production-quality code with tests above 90% coverage before the next begins. This mirrors docs/ROADMAP.md in the repo."
      />

      <div className="mx-auto max-w-4xl px-6 pb-6">
        {/* Progress bar */}
        <Reveal className="mb-14">
          <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
            <span>Overall progress</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{Math.round((done / roadmap.length) * 100)}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${(done / roadmap.length) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-brand-500 to-accent-400"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(STATUS) as PhaseStatus[]).map((key) => (
              <span key={key} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', STATUS[key].chip)}>
                {STATUS[key].icon}
                {STATUS[key].label}
              </span>
            ))}
          </div>
        </Reveal>

        {/* Timeline */}
        <ol className="relative space-y-6 border-l border-zinc-200 pl-8 dark:border-zinc-800">
          {roadmap.map((phase, i) => {
            const s = STATUS[phase.status];
            return (
              <Reveal key={phase.phase} delay={Math.min(i * 0.03, 0.3)}>
                <li className="relative">
                  <span className={cn('absolute -left-[41px] top-5 h-3.5 w-3.5 rounded-full shadow-lg ring-4 ring-zinc-50 dark:ring-[#09090c]', s.dot)} aria-hidden />
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-brand-400/50 dark:border-zinc-800 dark:bg-zinc-900/70">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-bold text-zinc-900 dark:text-zinc-50">
                        <span className="mr-2 font-mono text-sm text-zinc-400">P{String(phase.phase).padStart(2, '0')}</span>
                        {phase.title}
                      </h2>
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', s.chip)}>
                        {s.icon}
                        {s.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{phase.summary}</p>
                    <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                      <span className="font-semibold uppercase tracking-wide">Acceptance:</span> {phase.acceptance}
                    </p>
                  </div>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </div>

      <Reveal className="pb-24 text-center">
        <p className="text-zinc-500 dark:text-zinc-400">Want to influence what ships next?</p>
        <div className="mt-4 flex justify-center gap-3">
          <Button href={`${site.issuesUrl}/new`} variant="secondary">
            Request a feature
          </Button>
          <Button to="/contributing">Contribute</Button>
        </div>
      </Reveal>
    </>
  );
}
