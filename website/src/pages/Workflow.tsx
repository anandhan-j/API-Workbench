import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Seo } from '../lib/seo';
import { PageHeader } from '../components/PageHeader';
import { Reveal } from '../components/Reveal';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { AppMockup } from '../components/Mockups';
import { workflowSteps } from '../data/workflow-steps';
import { cn } from '../lib/utils';

function TimelineStep({ step, index }: { step: (typeof workflowSteps)[number]; index: number }) {
  const left = index % 2 === 0;
  const reduced = useReducedMotion();
  return (
    <li className="relative grid gap-6 md:grid-cols-2 md:gap-14">
      {/* Node dot on the spine */}
      <motion.span
        aria-hidden
        initial={reduced ? false : { scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.1 }}
        className="absolute left-4 top-8 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-xs font-bold text-white shadow-lg shadow-brand-500/40 md:left-1/2"
      >
        {index + 1}
      </motion.span>

      <Reveal from={left ? 'right' : 'left'} className={cn('pl-12 md:pl-0', left ? 'md:pr-0' : 'md:col-start-2')}>
        <div className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-card transition-colors hover:border-brand-400/50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-card-dark">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 transition-transform duration-300 group-hover:scale-110 dark:text-brand-300">
              <Icon name={step.icon} size={19} />
            </span>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{step.title}</h2>
          </div>
          <p className="mt-3 font-medium text-zinc-700 dark:text-zinc-300">{step.description}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{step.detail}</p>
        </div>
      </Reveal>
    </li>
  );
}

export default function Workflow() {
  return (
    <>
      <Seo
        title="Workflow"
        description="The complete API Workbench journey: install, import a spec, configure variables and auth, send requests, assert, design workflows, run, and extend with plugins."
        path="/workflow"
      />
      <PageHeader
        eyebrow="The journey"
        title="From install to automated API suites"
        lede="Nine steps, one continuous flow. Each one builds on the last — and everything after install works completely offline."
      />

      <div className="mx-auto max-w-5xl px-6 pb-10">
        <ol className="relative space-y-10">
          {/* Spine */}
          <motion.span
            aria-hidden
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            className="absolute bottom-4 left-4 top-4 w-px origin-top bg-gradient-to-b from-brand-500 via-accent-400 to-emerald-400 md:left-1/2"
          />
          {workflowSteps.map((step, i) => (
            <TimelineStep key={step.title} step={step} index={i} />
          ))}
          {/* Done marker */}
          <li className="relative pl-12 text-center md:pl-0">
            <span className="absolute left-4 top-1 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 md:left-1/2" aria-hidden>
              <CheckCircle2 size={18} />
            </span>
            <Reveal className="pt-14">
              <p className="text-2xl font-extrabold text-zinc-900 dark:text-white">Done — and repeatable</p>
              <p className="mx-auto mt-2 max-w-lg text-zinc-500 dark:text-zinc-400">
                Every run is deterministic, logged, and rerunnable. Snapshot your collections, export your workspace, and share
                workflows with your team.
              </p>
            </Reveal>
          </li>
        </ol>
      </div>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <Reveal>
          <AppMockup kind="workflow" />
        </Reveal>
        <Reveal className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button to="/docs/workflow-basics">
            Workflow documentation <ArrowRight size={16} />
          </Button>
          <Button to="/downloads" variant="secondary">
            Get started
          </Button>
        </Reveal>
      </section>
    </>
  );
}
