import { Link } from 'react-router-dom';
import { Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { GithubIcon } from '../components/Icon';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { useGitHubStats } from '../lib/github';
import { PageHeader } from '../components/PageHeader';
import { Reveal, Stagger, StaggerItem } from '../components/Reveal';
import { Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { CodeBlock } from '../components/CodeBlock';
import { Callout } from '../components/Callout';
import { installMethods } from '../data/downloads';
import { changelog } from '../data/changelog';

export default function Downloads() {
  const stats = useGitHubStats();
  const latest = stats.latestTag ?? `v${site.version} (pre-release)`;

  return (
    <>
      <Seo title="Downloads" description="Download API Workbench for Windows, macOS, and Linux — installers, portable builds, package managers, and building from source." path="/downloads" />
      <PageHeader eyebrow="Get the app" title="Download API Workbench" lede="Free, open source, MIT licensed. One codebase, three platforms — or build it yourself in two commands.">
        <Button href={stats.latestReleaseUrl ?? site.releasesUrl} size="lg">
          <Download size={18} /> Latest release · {latest}
        </Button>
        <Button href={site.releasesUrl} variant="secondary" size="lg">
          <GithubIcon size={18} /> All releases
        </Button>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-6 pb-24">
        <Callout kind="note" title="Pre-release software">
          API Workbench is in active development — 16 of 20 delivery phases are complete. Installers are unsigned until Phase 18
          (Security &amp; Packaging); your OS will ask you to confirm the first launch. Check the{' '}
          <a href={site.releasesUrl} target="_blank" rel="noreferrer">
            releases page
          </a>{' '}
          for the current binaries.
        </Callout>

        {/* Install methods */}
        <Stagger className="mt-10 grid gap-6 md:grid-cols-2">
          {installMethods.map((method) => (
            <StaggerItem key={method.platform} className="h-full">
              <article className="h-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-card-dark">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-accent-400/15 text-brand-500 dark:text-brand-300">
                    <Icon name={method.icon} size={21} />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{method.platform}</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{method.primary}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {method.steps.map((step, i) => (
                    <div key={i}>
                      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{step.label}</p>
                      {step.code && <CodeBlock code={step.code} lang={step.lang ?? 'bash'} className="my-2" />}
                    </div>
                  ))}
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Checksums */}
        <Reveal className="mt-12">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/70">
            <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-50">
              <ShieldCheck size={19} className="text-emerald-500" /> Verify your download
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Every release publishes SHA-256 checksums alongside the binaries. Verify before installing:
            </p>
            <CodeBlock
              lang="bash"
              code={`# Windows (PowerShell)\nGet-FileHash .\\API-Workbench-Setup-x64.exe -Algorithm SHA256\n\n# macOS / Linux\nshasum -a 256 API-Workbench.dmg`}
            />
          </div>
        </Reveal>

        {/* Previous versions / release notes */}
        <Reveal className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Previous versions</h2>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">
            Milestones so far — full notes on the <a className="text-brand-500 hover:underline" href={site.releasesUrl} target="_blank" rel="noreferrer">releases page</a> and the{' '}
            <Link className="text-brand-500 hover:underline" to="/changelog">changelog</Link>.
          </p>
          <div className="mt-5 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {changelog.map((entry) => (
              <div key={entry.version} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entry.version}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {entry.title} · {entry.date}
                  </p>
                </div>
                <a
                  href={site.releasesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline"
                >
                  Release notes <ExternalLink size={13} />
                </a>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </>
  );
}
