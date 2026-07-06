import { GitBranch, GitCommitHorizontal, GitPullRequest, TestTubes } from 'lucide-react';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { PageHeader } from '../components/PageHeader';
import { Reveal } from '../components/Reveal';
import { Button } from '../components/ui';
import { CodeBlock } from '../components/CodeBlock';
import { Callout } from '../components/Callout';
import { Tabs } from '../components/Tabs';

const steps = [
  { title: 'Fork & clone', body: <CodeBlock lang="bash" className="my-2" code={`# fork on GitHub, then\ngit clone https://github.com/<you>/API-Workbench.git\ncd API-Workbench`} /> },
  { title: 'Install & run', body: <CodeBlock lang="bash" className="my-2" code={'npm install        # also rebuilds better-sqlite3 for Electron\nnpm run dev        # HMR renderer + main'} /> },
  { title: 'Branch', body: <CodeBlock lang="bash" className="my-2" code={'git checkout -b feat/workflow-retry-jitter\n# prefixes: feat/ fix/ docs/ refactor/ test/ chore/'} /> },
  { title: 'Verify', body: <CodeBlock lang="bash" className="my-2" code={'npm run typecheck   # BOTH tsconfigs — node and web\nnpm run lint        # --max-warnings 0\nnpm test            # vitest, sql.js-backed'} /> },
  { title: 'Commit', body: <CodeBlock lang="bash" className="my-2" code={"git commit -m 'feat(workflows): add jitter to retry backoff'\n# Conventional Commits: type(scope): imperative summary"} /> },
  { title: 'Pull request', body: <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">Push your branch and open a PR against <code className="rounded bg-zinc-100 px-1 font-mono text-[0.9em] dark:bg-zinc-800">master</code>. Describe the why, list testing done, and link the issue. CI must pass; a maintainer reviews within a few days.</p> },
];

export default function Contributing() {
  return (
    <>
      <Seo title="Contributing" description="How to contribute to API Workbench: fork, build, test, code style, commit conventions, branch naming, and pull request flow." path="/contributing" />
      <PageHeader eyebrow="Join in" title="Contributing" lede="Bug reports, docs fixes, features, and plugins are all welcome. Here is the complete path from fork to merged PR.">
        <Button href={site.repoUrl} variant="secondary">
          <GitBranch size={16} /> Fork on GitHub
        </Button>
        <Button href={site.issuesUrl}>
          Good first issues
        </Button>
      </PageHeader>

      <div className="mx-auto max-w-4xl px-6 pb-24">
        {/* Steps */}
        <ol className="space-y-4">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.05}>
              <li className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
                <p className="flex items-center gap-3 font-bold text-zinc-900 dark:text-zinc-50">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 text-xs text-white">
                    {i + 1}
                  </span>
                  {step.title}
                </p>
                <div className="mt-2 pl-10">{step.body}</div>
              </li>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Project conventions</h2>
          <Tabs
            items={[
              {
                label: 'Code style',
                content: (
                  <ul className="space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    <li>• Prettier formats everything (<code className="font-mono">npm run format</code>); ESLint runs with zero-warning tolerance.</li>
                    <li>• Keep code on the correct side of the process split: <code className="font-mono">main/</code>, <code className="font-mono">renderer/</code>, <code className="font-mono">preload/</code>, <code className="font-mono">shared/</code>, <code className="font-mono">plugin-host/</code>.</li>
                    <li>• Never import <code className="font-mono">electron</code> into testable modules — inject it as a port (see CLAUDE.md / ADRs).</li>
                    <li>• IPC changes go through the shared Zod contract; add schema + handler + typed client together.</li>
                  </ul>
                ),
              },
              {
                label: 'Testing',
                content: (
                  <div className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    <p className="flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-200">
                      <TestTubes size={15} /> Vitest, colocated in <code className="font-mono">__tests__/</code>
                    </p>
                    <p className="mt-2">Persistence tests run against pure-WASM sql.js — no native build needed. Coverage stays above 90% per the phase Definition of Done. Run one file with:</p>
                    <CodeBlock lang="bash" className="my-2" code={'npx vitest run src/main/workflows/__tests__/workflow-engine.test.ts'} />
                  </div>
                ),
              },
              {
                label: 'Commits & branches',
                content: (
                  <div className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    <p className="flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-200">
                      <GitCommitHorizontal size={15} /> Conventional Commits
                    </p>
                    <CodeBlock lang="text" className="my-2" code={'feat(scope): add X\nfix(scope): correct Y\ndocs: clarify Z\n\nBranches: feat/<slug> · fix/<slug> · docs/<slug>'} />
                  </div>
                ),
              },
              {
                label: 'Issues',
                content: (
                  <ul className="space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    <li>• <strong>Bug reports:</strong> app version, OS, reproduction steps, expected vs actual, and logs (Help → Open log folder).</li>
                    <li>• <strong>Feature requests:</strong> the concrete use case first, proposed UX second.</li>
                    <li>• <strong>Plugin ideas:</strong> often better shipped as a plugin — ask in Discussions and we will point you at the right extension point.</li>
                  </ul>
                ),
              },
            ]}
          />
        </Reveal>

        <Reveal>
          <Callout kind="tip" title="Small PRs merge fastest">
            One logical change per PR. A focused 100-line diff with tests beats a 1,000-line rewrite — and the phase-based
            methodology means refactors land best when aligned with an open roadmap phase.
          </Callout>
          <div className="mt-8 text-center">
            <Button href={`${site.repoUrl}/pulls`} variant="secondary">
              <GitPullRequest size={16} /> Open pull requests
            </Button>
          </div>
        </Reveal>
      </div>
    </>
  );
}
