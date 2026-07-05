import type { ReactNode } from 'react';

export const INPUT_CLASS =
  'w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-accent';

/** A labeled form row used across the protocol editors. */
export function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline gap-2 text-xs font-medium text-muted">
        {label}
        {hint ? <span className="text-[11px] font-normal text-muted/70">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
