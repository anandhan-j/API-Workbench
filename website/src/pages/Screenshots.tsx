import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Seo } from '../lib/seo';
import { PageHeader } from '../components/PageHeader';
import { Reveal } from '../components/Reveal';
import { AppMockup, type MockupKind } from '../components/Mockups';
import { Lightbox } from '../components/Lightbox';
import { cn } from '../lib/utils';

interface Screen {
  kind: MockupKind;
  tone?: 'dark' | 'light';
  title: string;
  description: string;
  highlights: string[];
}

const screens: Screen[] = [
  {
    kind: 'requests',
    title: 'Request Editor',
    description: 'The daily driver: a virtualized collection tree, tabbed editors, and a response viewer with status, timing, and pretty-printed bodies.',
    highlights: ['Method-colored tree with protocol badges', '{{variable}} templates in every field', 'Response metrics: time, size, phases'],
  },
  {
    kind: 'workflow',
    title: 'Workflow Builder',
    description: 'Drag requests onto the canvas and wire them into real automations with conditions, loops, and human-in-the-loop prompts.',
    highlights: ['Labelled branch edges', 'Mini map & smooth pan/zoom', 'Live run status on the canvas'],
  },
  {
    kind: 'plugins',
    title: 'Plugin Manager',
    description: 'Install plugins from file, review the capabilities they request, and enable or disable them atomically.',
    highlights: ['Per-plugin capability grants', 'Contribution badges per extension point', 'Structured plugin logs one click away'],
  },
  {
    kind: 'variables',
    title: 'Variables & Secrets',
    description: 'Seven scopes with strict precedence. Secret values encrypt via the OS keychain and never reach the UI as plaintext.',
    highlights: ['Scope chips: global → runtime', 'Secrets masked everywhere', 'Per-workspace environments'],
  },
  {
    kind: 'diff',
    title: 'OpenAPI Sync Review',
    description: 'Re-import a changed spec and review exactly what will happen before merging — additions, changes, removals, and conflicts.',
    highlights: ['Added / changed / removed counts', 'Manual edits preserved by default', 'Auto-snapshot before every merge'],
  },
  {
    kind: 'terminal',
    title: 'Run Log & Console',
    description: 'Every workflow run streams a structured log: step timing, retries, assertions, and script console output.',
    highlights: ['Timestamps per step', 'Warnings and retries surfaced inline', 'Pass/fail summary at a glance'],
  },
  {
    kind: 'settings',
    title: 'Settings & Configuration',
    description: 'Appearance, editor behavior, network defaults, shortcuts, and data management — organized and searchable.',
    highlights: ['Theme cards with live preview', 'Network defaults: timeout, redirects', 'Backup & restore built in'],
  },
  {
    kind: 'themes',
    title: 'Dark & Light Themes',
    description: 'A complete theme system, not an afterthought — every panel, editor, and dialog is designed for both modes.',
    highlights: ['Dark, light, and system modes', 'Consistent syntax colors', 'High-contrast friendly'],
  },
  {
    kind: 'requests',
    tone: 'light',
    title: 'Light Mode',
    description: 'The full request editor in light mode — same layout, same density, tuned contrast.',
    highlights: ['Identical feature set in both themes', 'Softer panel borders', 'Print-friendly documentation exports'],
  },
];

export default function Screenshots() {
  const [selected, setSelected] = useState<Screen | null>(null);

  return (
    <>
      <Seo title="Screenshots" description="Annotated screenshots of every major API Workbench screen: request editor, workflow builder, plugin manager, sync review, settings, and themes." path="/screenshots" />
      <PageHeader eyebrow="Screen by screen" title="Screenshots" lede="Every major surface of the app, annotated. These are rendered mockups sized like the real UI — swap in captures as releases ship." />

      <div className="mx-auto max-w-6xl space-y-24 px-6 pb-24">
        {screens.map((screen, i) => {
          const flip = i % 2 === 1;
          return (
            <section key={screen.title} className="grid items-center gap-10 lg:grid-cols-2">
              <Reveal from={flip ? 'left' : 'right'} className={cn(flip && 'lg:order-2')}>
                <button
                  type="button"
                  onClick={() => setSelected(screen)}
                  aria-label={`Enlarge ${screen.title} screenshot`}
                  className="group block w-full cursor-zoom-in text-left"
                >
                  <div className="overflow-hidden rounded-2xl shadow-card transition-shadow duration-300 group-hover:shadow-glow dark:shadow-card-dark">
                    <div className="transition-transform duration-500 group-hover:scale-[1.03]">
                      <AppMockup kind={screen.kind} tone={screen.tone ?? 'dark'} />
                    </div>
                  </div>
                </button>
              </Reveal>
              <Reveal from={flip ? 'right' : 'left'} className={cn(flip && 'lg:order-1')}>
                <p className="text-sm font-semibold uppercase tracking-widest text-brand-500 dark:text-brand-400">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">{screen.title}</h2>
                <p className="mt-3 leading-7 text-zinc-600 dark:text-zinc-400">{screen.description}</p>
                <ul className="mt-5 space-y-2.5">
                  {screen.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                      {h}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </section>
          );
        })}
      </div>

      <Lightbox open={selected !== null} onClose={() => setSelected(null)} title={selected?.title} caption={selected?.description}>
        {selected && <AppMockup kind={selected.kind} tone={selected.tone ?? 'dark'} />}
      </Lightbox>
    </>
  );
}
