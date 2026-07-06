import { useId, useState } from 'react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface TabItem {
  label: string;
  content: ReactNode;
}

/** Accessible tab set with an animated active-pill indicator. */
export function Tabs({ items, className }: { items: TabItem[]; className?: string }) {
  const [active, setActive] = useState(0);
  const groupId = useId();

  return (
    <div className={cn('my-5', className)}>
      <div role="tablist" aria-label="Options" className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-zinc-100/70 p-1 dark:border-zinc-800 dark:bg-zinc-900/70">
        {items.map((item, i) => (
          <button
            key={item.label}
            role="tab"
            id={`${groupId}-tab-${i}`}
            aria-selected={active === i}
            aria-controls={`${groupId}-panel-${i}`}
            onClick={() => setActive(i)}
            className={cn(
              'relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              active === i ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            {active === i && (
              <motion.span
                layoutId={`${groupId}-pill`}
                className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-zinc-700/80"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{item.label}</span>
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <div
          key={item.label}
          role="tabpanel"
          id={`${groupId}-panel-${i}`}
          aria-labelledby={`${groupId}-tab-${i}`}
          hidden={active !== i}
          className="pt-3"
        >
          {active === i && item.content}
        </div>
      ))}
    </div>
  );
}
