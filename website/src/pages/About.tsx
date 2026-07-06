import { HeartHandshake, Layers3, ShieldCheck, Target } from 'lucide-react';
import { GithubIcon } from '../components/Icon';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { PageHeader } from '../components/PageHeader';
import { Reveal, Stagger, StaggerItem } from '../components/Reveal';
import { Button } from '../components/ui';

const principles = [
  {
    icon: <Target size={20} />,
    title: 'Offline-first, forever',
    text: 'Your collections, secrets, and history belong on your machine. Cloud features, if they ever come, will be optional additions — never the storage model.',
  },
  {
    icon: <Layers3 size={20} />,
    title: 'Phases, not promises',
    text: 'The project ships in 20 strictly-ordered phases. A phase is done only when code, tests (>90% coverage), docs, and acceptance criteria all hold — no TODOs left behind.',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: 'Security is architecture',
    text: 'Context isolation, an allowlisted IPC bridge validated by Zod on both sides, keychain-encrypted secrets, and sandboxed plugins were designed in from the start — not patched in later.',
  },
  {
    icon: <HeartHandshake size={20} />,
    title: 'Open source, open design',
    text: 'MIT licensed, with the reasoning preserved: every significant decision is an ADR in the repo, so contributors can understand why, not just what.',
  },
];

export default function About() {
  return (
    <>
      <Seo title="About" description="The story and principles behind API Workbench — an offline-first, open-source API testing and workflow automation desktop app." path="/about" />
      <PageHeader eyebrow="The project" title="About API Workbench" lede="A one-developer mission to build the API client that respects your data, your specs, and your time." />

      <div className="mx-auto max-w-4xl px-6 pb-24">
        <Reveal>
          <div className="doc-prose">
            <p>
              API Workbench started with a simple frustration: every serious API team lives in a gap between their OpenAPI specs
              and their API client. Specs evolve; hand-maintained collections rot. Fixing that properly — a sync engine that
              merges instead of overwrites — required owning the whole stack: storage, diffing, versioning, execution.
            </p>
            <p>
              Once that foundation existed, the rest followed naturally. Deterministic workflows on top of the execution engine.
              Seven variable scopes with real secret encryption. And a plugin SDK so the community can extend the tool without
              anyone waiting on the core.
            </p>
            <p>
              The project is built phase by phase — 16 of 20 complete — by <strong>{site.author}</strong>, with an unusual
              discipline: each phase reaches production quality, with tests and documentation, before the next begins. The full
              methodology, architecture decision records, and roadmap live in the repository.
            </p>
          </div>
        </Reveal>

        <h2 className="mb-6 mt-14 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Principles</h2>
        <Stagger className="grid gap-5 sm:grid-cols-2">
          {principles.map((p) => (
            <StaggerItem key={p.title} className="h-full">
              <div className="h-full rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 dark:text-brand-300">
                  {p.icon}
                </span>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-50">{p.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{p.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-14 rounded-2xl border border-zinc-200 bg-gradient-to-br from-brand-500/[0.06] to-accent-400/[0.06] p-8 text-center dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Built in the open</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Star the repo to follow along, open issues to shape the roadmap, or pick up a phase task and contribute.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button href={site.repoUrl}>
              <GithubIcon size={16} /> View on GitHub
            </Button>
            <Button to="/contributing" variant="secondary">
              Contributing guide
            </Button>
          </div>
        </Reveal>
      </div>
    </>
  );
}
