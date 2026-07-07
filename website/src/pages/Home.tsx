import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, BookOpen, Download, Star } from 'lucide-react';
import { GithubIcon } from '../components/Icon';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { formatCount, useGitHubStats } from '../lib/github';
import { Badge, Button, LiftCard, SectionHeading } from '../components/ui';
import { Reveal, Stagger, StaggerItem } from '../components/Reveal';
import { AppMockup } from '../components/Mockups';
import { Icon } from '../components/Icon';
import { Counter } from '../components/Counter';
import { CodeBlock } from '../components/CodeBlock';
import { features } from '../data/features';
import { workflowSteps } from '../data/workflow-steps';

function HeroBackground() {
  const reduced = useReducedMotion();
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="bg-grid absolute inset-0" />
      <div className="absolute left-1/2 top-[-180px] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl dark:bg-brand-500/15" />
      <div className="absolute right-[8%] top-[30%] h-72 w-72 rounded-full bg-accent-400/10 blur-3xl" />
      {!reduced && (
        <>
          <motion.div
            className="absolute left-[12%] top-[22%] h-16 w-16 rounded-2xl border border-brand-400/30 bg-brand-500/10 backdrop-blur-sm"
            animate={{ y: [0, -22, 0], rotate: [0, 8, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute right-[14%] top-[18%] h-10 w-10 rounded-full border border-accent-400/40 bg-accent-400/10"
            animate={{ y: [0, 18, 0], x: [0, -8, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-[28%] left-[6%] h-8 w-8 rotate-45 border border-fuchsia-400/30 bg-fuchsia-500/10"
            animate={{ y: [0, -14, 0], rotate: [45, 90, 45] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}
    </div>
  );
}

function Hero() {
  const stats = useGitHubStats();
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const mockupY = useTransform(scrollY, [0, 600], [0, reduced ? 0 : -60]);
  const sideY = useTransform(scrollY, [0, 600], [0, reduced ? 0 : 40]);

  return (
    <section className="relative overflow-hidden pb-24 pt-32 sm:pt-40">
      <HeroBackground />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge>
              <Star size={12} className="fill-current" /> Free & open source · MIT · v{site.version}
            </Badge>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight text-zinc-900 dark:text-white sm:text-6xl lg:text-7xl"
          >
            Test APIs.
            <br />
            <span className="text-gradient">Automate everything.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400"
          >
            {site.name} is an <strong className="font-semibold text-zinc-800 dark:text-zinc-200">offline-first desktop app</strong> for
            API testing and visual workflow automation. Import OpenAPI specs and keep them in sync, run REST, GraphQL, gRPC,
            WebSocket & SSE, automate with a real workflow engine, and put a{' '}
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">bring-your-own-key AI assistant</strong> to work on your
            collections — your data never leaves your machine.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.28 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <Button to="/downloads" size="lg">
              <Download size={18} /> Download
            </Button>
            <Button to="/docs" variant="secondary" size="lg">
              <BookOpen size={18} /> Documentation
            </Button>
            <Button href={site.repoUrl} variant="ghost" size="lg">
              <GithubIcon size={18} /> Star on GitHub
              {stats.stars !== null && (
                <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-xs dark:bg-white/10">{formatCount(stats.stars)}</span>
              )}
            </Button>
          </motion.div>
        </div>

        {/* Hero visual: floating window composition with 3D perspective */}
        <div className="relative mx-auto mt-20 max-w-5xl" style={{ perspective: '1600px' }}>
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 h-[70%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/20 blur-3xl"
          />
          <motion.div
            style={{ y: mockupY }}
            initial={{ opacity: 0, y: 60, rotateX: 14 }}
            animate={{ opacity: 1, y: 0, rotateX: 5 }}
            transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative shadow-glow"
          >
            <AppMockup kind="requests" aspect="aspect-[16/9]" />
          </motion.div>
          <motion.div
            style={{ y: sideY }}
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="absolute -left-6 bottom-[-14%] hidden w-[38%] md:block"
          >
            <AppMockup kind="workflow" tone="dark" className="rotate-[-3deg]" />
          </motion.div>
          <motion.div
            style={{ y: sideY }}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="absolute -right-6 bottom-[-18%] hidden w-[34%] md:block"
          >
            <AppMockup kind="requests" tone="light" className="rotate-[2.5deg]" />
          </motion.div>
        </div>
        <div className="h-10 md:h-28" />
      </div>
    </section>
  );
}

function Stats() {
  const items = [
    { value: 20, suffix: '+', label: 'Delivery phases, 16 complete' },
    { value: 8, suffix: '', label: 'Built-in auth schemes' },
    { value: 5, suffix: '', label: 'Protocols out of the box' },
    { value: 10000, suffix: '+', label: 'Requests per collection, still smooth' },
  ];
  return (
    <section className="border-y border-zinc-200 bg-white/60 py-12 dark:border-zinc-800/70 dark:bg-zinc-900/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 text-center lg:grid-cols-4">
        {items.map((item, i) => (
          <Reveal key={item.label} delay={i * 0.08}>
            <p className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              <Counter to={item.value} suffix={item.suffix} />
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{item.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FeatureGrid() {
  const highlights = features.filter((f) =>
    ['OpenAPI Import', 'Spec Synchronization', 'Visual Workflow Designer', 'In-App AI Assistant', 'Plugin SDK', 'Offline-First Storage'].includes(f.title)
  );
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Why API Workbench"
          title="A serious workbench, not another thin client"
          lede="Spec-linked collections, a real workflow engine, and a security model designed before the first plugin was written."
        />
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.map((f) => (
            <StaggerItem key={f.title}>
              <LiftCard className="h-full">
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-accent-400/15 text-brand-500 transition-transform duration-300 group-hover:scale-110 dark:text-brand-300">
                  <Icon name={f.icon} size={21} />
                </span>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{f.description}</p>
              </LiftCard>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal className="mt-10 text-center">
          <Button to="/features" variant="secondary">
            Explore all {features.length} features <ArrowRight size={16} />
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

function WorkflowStrip() {
  const steps = workflowSteps.slice(0, 5);
  return (
    <section className="border-y border-zinc-200 bg-zinc-100/50 py-24 dark:border-zinc-800/70 dark:bg-zinc-900/40">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="How it works"
          title="From spec to automated suite in minutes"
          lede="Import, configure, send, assert, automate — one continuous flow."
        />
        <div className="grid gap-4 md:grid-cols-5">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.1} className="relative">
              <div className="glass h-full rounded-2xl p-5 text-center">
                <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-brand-500/30">
                  <Icon name={step.icon} size={19} />
                </span>
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-500 dark:text-brand-400">Step {i + 1}</p>
                <h3 className="mt-1 font-bold text-zinc-900 dark:text-zinc-50">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{step.description}</p>
              </div>
              {i < steps.length - 1 && (
                <span className="absolute -right-3.5 top-1/2 hidden -translate-y-1/2 text-zinc-300 dark:text-zinc-600 md:block" aria-hidden>
                  <ArrowRight size={16} />
                </span>
              )}
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 text-center">
          <Button to="/workflow" variant="secondary">
            See the full workflow <ArrowRight size={16} />
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

function AssistantSection() {
  return (
    <section className="border-y border-zinc-200 bg-zinc-100/50 py-24 dark:border-zinc-800/70 dark:bg-zinc-900/40">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
        <Reveal from="left">
          <CodeBlock
            title="claude_desktop_config.json"
            lang="json"
            className="my-0"
            code={`{
  "mcpServers": {
    "api-workbench": {
      "url": "https://127.0.0.1:7337/mcp?token=•••",
      "note": "loopback-only · bearer token · TLS on"
    }
  }
}`}
          />
        </Reveal>
        <Reveal from="right">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-500 dark:text-brand-400">AI & MCP</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            An assistant that works on <span className="text-gradient">your APIs</span>
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Bring your own key — Anthropic, OpenAI, DeepSeek, Groq, OpenRouter, or a local Ollama endpoint — and let the built-in
            assistant browse and edit collections, build requests from a pasted cURL command, and draft whole workflows. Or connect
            an external MCP client and author workflows against the app’s real schema.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              'Bring-your-own-key: no key, no calls, no cloud lock-in',
              'Reads instantly; every write and run needs your approval',
              'Auto-snapshots before each edit — one click to undo',
              'Secrets redacted before they ever reach the model',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex gap-3">
            <Button to="/docs/ai-assistant">
              Assistant docs <ArrowRight size={16} />
            </Button>
            <Button to="/docs/mcp-server" variant="secondary">
              MCP server
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PluginTeaser() {
  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
        <Reveal from="right">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-500 dark:text-brand-400">Plugin SDK</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Extend it in an afternoon
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Custom workflow nodes, request types, auth providers, and importers — declared in a manifest, implemented in a few
            lines of TypeScript, and executed in a sandboxed process where every sensitive capability needs the user's explicit
            grant.
          </p>
          <ul className="mt-6 space-y-3">
            {['Types-only SDK — nothing to link against', 'Declarative forms; the host renders all UI', 'Capability broker checks every call', 'Eight example plugins to copy from'].map(
              (item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                    ✓
                  </span>
                  {item}
                </li>
              )
            )}
          </ul>
          <div className="mt-8 flex gap-3">
            <Button to="/plugins">
              Plugin docs <ArrowRight size={16} />
            </Button>
            <Button to="/examples" variant="secondary">
              Examples
            </Button>
          </div>
        </Reveal>
        <Reveal from="left">
          <CodeBlock
            title="src/index.ts"
            lang="ts"
            className="my-0"
            code={`import { definePlugin } from '@api-workbench/plugin-sdk';
import { randomUUID } from 'node:crypto';

export default definePlugin({
  activate(ctx) {
    ctx.registerNodeExecutor('uuid', {
      async execute({ config }) {
        const name = String(config.variable);
        return {
          message: \`Generated {{\${name}}}\`,
          variables: { [name]: randomUUID() },
        };
      },
    });
  },
});`}
          />
        </Reveal>
      </div>
    </section>
  );
}

function PrivacySection() {
  return (
    <section className="border-y border-zinc-200 bg-zinc-100/50 py-24 dark:border-zinc-800/70 dark:bg-zinc-900/40">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
        <Reveal>
          <AppMockup kind="variables" />
        </Reveal>
        <Reveal from="left">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-500 dark:text-brand-400">Offline-first</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            Your APIs are your business. Literally.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Everything — collections, credentials, history, workflows — lives in a local SQLite database. Secrets are encrypted
            with your OS keychain and decrypted only in the trusted main process. No account. No sync service. No telemetry
            surprises.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              { title: 'Local SQLite', text: 'Append-only migrations, transactions, backup & restore.' },
              { title: 'OS keychain secrets', text: 'The UI never sees secret plaintext — by architecture.' },
              { title: 'Hardened Electron', text: 'Context isolation, sandbox, allowlisted IPC with Zod.' },
              { title: 'Sandboxed plugins', text: 'Third-party code runs isolated with user-approved grants.' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{item.text}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28">
      <div aria-hidden className="absolute left-1/2 top-1/2 h-96 w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/15 blur-3xl" />
      <Reveal className="relative mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
          Ready to <span className="text-gradient">own your API workflow?</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Download API Workbench for Windows, macOS, or Linux — or build it from source in two commands.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button to="/downloads" size="lg">
            <Download size={18} /> Get API Workbench
          </Button>
          <Button to="/docs/quick-start" variant="secondary" size="lg">
            5-minute Quick Start
          </Button>
        </div>
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          MIT licensed · No account required ·{' '}
          <Link to="/roadmap" className="text-brand-500 hover:underline">
            16 of 20 phases complete
          </Link>
        </p>
      </Reveal>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Seo path="/" />
      <Hero />
      <Stats />
      <FeatureGrid />
      <WorkflowStrip />
      <AssistantSection />
      <PluginTeaser />
      <PrivacySection />
      <FinalCta />
    </>
  );
}
