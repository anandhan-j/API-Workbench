import { AlertTriangle, Info, Lightbulb, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export type CalloutKind = 'note' | 'tip' | 'warning' | 'danger';

const STYLES: Record<CalloutKind, { icon: ReactNode; box: string; heading: string; defaultTitle: string }> = {
  note: {
    icon: <Info size={16} />,
    box: 'border-sky-500/30 bg-sky-500/[0.07]',
    heading: 'text-sky-600 dark:text-sky-400',
    defaultTitle: 'Note',
  },
  tip: {
    icon: <Lightbulb size={16} />,
    box: 'border-emerald-500/30 bg-emerald-500/[0.07]',
    heading: 'text-emerald-600 dark:text-emerald-400',
    defaultTitle: 'Tip',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    box: 'border-amber-500/30 bg-amber-500/[0.07]',
    heading: 'text-amber-600 dark:text-amber-400',
    defaultTitle: 'Warning',
  },
  danger: {
    icon: <ShieldAlert size={16} />,
    box: 'border-red-500/30 bg-red-500/[0.07]',
    heading: 'text-red-600 dark:text-red-400',
    defaultTitle: 'Important',
  },
};

/** Documentation admonition (note / tip / warning / danger). */
export function Callout({ kind = 'note', title, children }: { kind?: CalloutKind; title?: string; children: ReactNode }) {
  const s = STYLES[kind];
  return (
    <div className={cn('my-5 rounded-xl border p-4', s.box)} role="note">
      <p className={cn('mb-1.5 flex items-center gap-2 text-sm font-semibold', s.heading)}>
        {s.icon}
        {title ?? s.defaultTitle}
      </p>
      <div className="text-sm leading-6 text-zinc-700 dark:text-zinc-300 [&_code]:rounded [&_code]:bg-black/[0.06] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] dark:[&_code]:bg-white/10">
        {children}
      </div>
    </div>
  );
}
