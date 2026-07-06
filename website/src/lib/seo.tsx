import { useEffect } from 'react';
import { site } from './site';

interface SeoProps {
  title?: string;
  description?: string;
  /** Route path, e.g. "/features". Used for the canonical URL. */
  path?: string;
}

function setMeta(selector: string, attr: string, value: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) el.setAttribute(attr, value);
}

/** Per-page head management: title, description, canonical, OG/Twitter. */
export function Seo({ title, description, path = '/' }: SeoProps) {
  useEffect(() => {
    const fullTitle = title ? `${title} · ${site.name}` : `${site.name} — ${site.tagline}`;
    const desc = description ?? site.description;
    const canonical = `${site.siteUrl}${path === '/' ? '/' : path}`;

    document.title = fullTitle;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', fullTitle);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('meta[name="twitter:title"]', 'content', fullTitle);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    document.head.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
  }, [title, description, path]);

  return null;
}
