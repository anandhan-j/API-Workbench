import { Bug, Lightbulb, Mail, MessageSquare, ShieldAlert } from 'lucide-react';
import { GithubIcon } from '../components/Icon';
import type { ReactNode } from 'react';
import { Seo } from '../lib/seo';
import { site } from '../lib/site';
import { PageHeader } from '../components/PageHeader';
import { Stagger, StaggerItem } from '../components/Reveal';

interface Channel {
  icon: ReactNode;
  title: string;
  text: string;
  action: string;
  href: string;
}

const channels: Channel[] = [
  {
    icon: <Bug size={20} />,
    title: 'Report a bug',
    text: 'Something broken? Include your app version, OS, reproduction steps, and logs (Help → Open log folder).',
    action: 'Open an issue',
    href: `${site.issuesUrl}/new`,
  },
  {
    icon: <Lightbulb size={20} />,
    title: 'Request a feature',
    text: 'Describe the use case first — what you are trying to accomplish beats a specific UI suggestion.',
    action: 'Suggest on GitHub',
    href: `${site.issuesUrl}/new`,
  },
  {
    icon: <MessageSquare size={20} />,
    title: 'Ask a question',
    text: 'Usage help, plugin development, architecture questions — Discussions is the right room.',
    action: 'GitHub Discussions',
    href: site.discussionsUrl,
  },
  {
    icon: <ShieldAlert size={20} />,
    title: 'Security disclosure',
    text: 'Found a vulnerability? Please disclose privately via GitHub security advisories rather than a public issue.',
    action: 'Report privately',
    href: `${site.repoUrl}/security/advisories/new`,
  },
  {
    icon: <GithubIcon size={20} />,
    title: 'Contribute',
    text: 'PRs welcome — from typo fixes to whole plugins. Start with the contributing guide.',
    action: 'Contributing guide',
    href: '/contributing',
  },
  {
    icon: <Mail size={20} />,
    title: 'Everything else',
    text: 'Partnerships, talks, press, or anything that does not fit an issue tracker.',
    action: 'Open a discussion',
    href: site.discussionsUrl,
  },
];

export default function Contact() {
  return (
    <>
      <Seo title="Contact" description="How to reach the API Workbench project: bug reports, feature requests, questions, security disclosures, and contributions." path="/contact" />
      <PageHeader eyebrow="Get in touch" title="Contact" lede="API Workbench is developed in the open — nearly every conversation belongs on GitHub, where others can find the answer too." />

      <div className="mx-auto max-w-5xl px-6 pb-24">
        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => (
            <StaggerItem key={ch.title} className="h-full">
              <a
                href={ch.href}
                {...(ch.href.startsWith('/') ? {} : { target: '_blank', rel: 'noreferrer' })}
                className="group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-card transition-all hover:-translate-y-1 hover:border-brand-400/50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-card-dark"
              >
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 transition-transform group-hover:scale-110 dark:text-brand-300">
                  {ch.icon}
                </span>
                <h2 className="font-bold text-zinc-900 dark:text-zinc-50">{ch.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{ch.text}</p>
                <span className="mt-4 text-sm font-semibold text-brand-500 group-hover:underline dark:text-brand-300">{ch.action} →</span>
              </a>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </>
  );
}
