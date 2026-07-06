import { useEffect, useState } from 'react';
import { site } from './site';

export interface GitHubStats {
  stars: number | null;
  forks: number | null;
  openIssues: number | null;
  latestTag: string | null;
  latestReleaseUrl: string | null;
  publishedAt: string | null;
}

const EMPTY: GitHubStats = {
  stars: null,
  forks: null,
  openIssues: null,
  latestTag: null,
  latestReleaseUrl: null,
  publishedAt: null,
};

const CACHE_KEY = 'apiwb-gh-stats';
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Live repo stats from the public GitHub API, cached in sessionStorage for
 * 30 minutes. Fails silently to nulls — every consumer renders a fallback.
 */
export function useGitHubStats(): GitHubStats {
  const [stats, setStats] = useState<GitHubStats>(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { at, data } = JSON.parse(raw) as { at: number; data: GitHubStats };
        if (Date.now() - at < CACHE_TTL_MS) return data;
      }
    } catch {
      /* ignore cache errors */
    }
    return EMPTY;
  });

  useEffect(() => {
    if (stats.stars !== null) return;
    let cancelled = false;
    const base = `https://api.github.com/repos/${site.repoOwner}/${site.repoName}`;

    (async () => {
      try {
        const repoRes = await fetch(base);
        if (!repoRes.ok) return;
        const repo = await repoRes.json();
        let latestTag: string | null = null;
        let latestReleaseUrl: string | null = null;
        let publishedAt: string | null = null;
        try {
          const relRes = await fetch(`${base}/releases/latest`);
          if (relRes.ok) {
            const rel = await relRes.json();
            latestTag = rel.tag_name ?? null;
            latestReleaseUrl = rel.html_url ?? null;
            publishedAt = rel.published_at ?? null;
          }
        } catch {
          /* no releases yet */
        }
        const data: GitHubStats = {
          stars: repo.stargazers_count ?? null,
          forks: repo.forks_count ?? null,
          openIssues: repo.open_issues_count ?? null,
          latestTag,
          latestReleaseUrl,
          publishedAt,
        };
        if (!cancelled) {
          setStats(data);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
          } catch {
            /* storage full/unavailable */
          }
        }
      } catch {
        /* offline — fallbacks render */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stats.stars]);

  return stats;
}

export function formatCount(n: number | null, fallback = '—'): string {
  if (n === null) return fallback;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
