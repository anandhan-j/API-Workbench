import { Link } from 'react-router-dom';
import { Heart, MessageSquare, Rss } from 'lucide-react';
import { GithubIcon } from './Icon';
import { footerColumns, site } from '../lib/site';
import { useGitHubStats } from '../lib/github';

export function Footer() {
  const stats = useGitHubStats();
  const version = stats.latestTag ?? `v${site.version}`;

  return (
    <footer className="border-t border-zinc-200 bg-zinc-50/60 dark:border-zinc-800/80 dark:bg-[#0b0b0f]">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <p className="text-lg font-bold text-zinc-900 dark:text-white">
              API <span className="text-gradient">Workbench</span>
            </p>
            <p className="mt-3 max-w-xs text-sm leading-6 text-zinc-500 dark:text-zinc-400">{site.tagline}. Free and open source under the MIT license.</p>
            <div className="mt-4 flex items-center gap-2">
              <a
                href={site.repoUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub repository"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-zinc-800 dark:text-zinc-400"
              >
                <GithubIcon size={16} />
              </a>
              <a
                href={site.discussionsUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub discussions"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-zinc-800 dark:text-zinc-400"
              >
                <MessageSquare size={16} />
              </a>
              <a
                href={`${site.siteUrl}/rss.xml`}
                aria-label="Changelog RSS feed"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-zinc-800 dark:text-zinc-400"
              >
                <Rss size={16} />
              </a>
            </div>
          </div>

          {footerColumns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.to}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-zinc-500 transition-colors hover:text-brand-500 dark:text-zinc-400 dark:hover:text-brand-300"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.to}
                        className="text-sm text-zinc-500 transition-colors hover:text-brand-500 dark:text-zinc-400 dark:hover:text-brand-300"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {site.author}. MIT licensed.
          </p>
          <p className="flex items-center gap-1.5">
            <span className="rounded-full border border-zinc-300 px-2 py-0.5 font-mono text-xs dark:border-zinc-700">{version}</span>
            <span className="hidden items-center gap-1 sm:flex">
              · Built with <Heart size={13} className="fill-red-500 text-red-500" aria-label="love" /> for API developers
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
