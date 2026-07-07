import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, Search, X } from 'lucide-react';
import { GithubIcon } from './Icon';
import { navItems } from '../lib/site';
import { cn } from '../lib/utils';
import { ThemeToggle } from './ThemeToggle';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="API Workbench home">
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="nav-logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#nav-logo-g)" />
        <path d="M20 40 L26 22 L32 40 M22.5 34 H29.5" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M38 22 L38 40 M38 22 H43 a5 5 0 0 1 0 10 H38" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">
        API <span className="text-gradient">Workbench</span>
      </span>
    </Link>
  );
}

export function Navbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || mobileOpen ? 'glass shadow-sm' : 'bg-transparent'
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <Logo />

        {/* Desktop links */}
        <ul className="hidden items-center gap-0.5 lg:flex">
          {navItems.map((item) =>
            item.external ? (
              <li key={item.label}>
                <a
                  href={item.to}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  <GithubIcon size={15} />
                  {item.label}
                </a>
              </li>
            ) : (
              <li key={item.label} className="relative">
                <NavLink
                  to={item.to}
                  className={cn(
                    'relative block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.to)
                      ? 'text-zinc-900 dark:text-white'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                  )}
                >
                  {item.label}
                  {isActive(item.to) && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-3 -bottom-[3px] h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-400"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                </NavLink>
              </li>
            )
          )}
        </ul>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search (Ctrl+K)"
            className="hidden h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-800 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200 md:flex"
          >
            <Search size={14} />
            <span className="text-xs">Search…</span>
            <kbd className="rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 dark:border-zinc-700">
              Ctrl K
            </kbd>
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10 md:hidden"
          >
            <Search size={17} />
          </button>
          <ThemeToggle />
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10 lg:hidden"
          >
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.6, 0.3, 1] }}
            className="overflow-hidden border-t border-zinc-200/60 dark:border-white/10 lg:hidden"
          >
            <ul className="space-y-0.5 px-4 py-3">
              {navItems.map((item) => (
                <li key={item.label}>
                  {item.external ? (
                    <a
                      href={item.to}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-300"
                    >
                      <GithubIcon size={15} /> {item.label}
                    </a>
                  ) : (
                    <NavLink
                      to={item.to}
                      className={cn(
                        'block rounded-lg px-3 py-2.5 text-sm font-medium',
                        isActive(item.to)
                          ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
                          : 'text-zinc-600 dark:text-zinc-300'
                      )}
                    >
                      {item.label}
                    </NavLink>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
