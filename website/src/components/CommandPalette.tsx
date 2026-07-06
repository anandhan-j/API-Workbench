import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CornerDownLeft, FileText, Search } from 'lucide-react';
import { search, searchIndex, type SearchEntry } from '../docs/registry';
import { cn } from '../lib/utils';

const DEFAULT_RESULTS: SearchEntry[] = searchIndex.filter((e) => e.group === 'Pages').slice(0, 8);

/** Ctrl+K command palette searching every page and documentation article. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo(() => (query.trim() ? search(query) : DEFAULT_RESULTS), [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  const go = (entry: SearchEntry) => {
    onClose();
    navigate(entry.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault();
      go(results[cursor]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: -12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: -8, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700/70 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-800">
              <Search size={17} className="shrink-0 text-zinc-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search docs, plugins, pages…"
                aria-label="Search"
                className="w-full bg-transparent py-4 text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
              />
              <kbd className="rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 dark:border-zinc-700">esc</kbd>
            </div>
            <ul className="thin-scroll max-h-[46vh] overflow-y-auto p-2" role="listbox" aria-label="Search results">
              {results.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No results for “{query}”. Try “variables”, “plugin”, or “sync”.
                </li>
              )}
              {results.map((entry, i) => (
                <li key={entry.path + entry.title} role="option" aria-selected={i === cursor}>
                  <button
                    type="button"
                    onClick={() => go(entry)}
                    onMouseEnter={() => setCursor(i)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                      i === cursor ? 'bg-brand-500/10' : 'hover:bg-zinc-100 dark:hover:bg-white/5'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                        i === cursor
                          ? 'border-brand-400/50 text-brand-500'
                          : 'border-zinc-200 text-zinc-400 dark:border-zinc-700'
                      )}
                    >
                      <FileText size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', i === cursor ? 'text-brand-600 dark:text-brand-300' : 'text-zinc-800 dark:text-zinc-100')}>
                        {entry.title}
                      </span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{entry.description}</span>
                    </span>
                    <span className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700">
                      {entry.group}
                    </span>
                    {i === cursor && <CornerDownLeft size={13} className="shrink-0 text-zinc-400" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
