import type { ReactNode } from 'react';

export const INPUT_CLASS =
  'w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-accent';

/**
 * Parses a numeric input, keeping the last valid value when the field is
 * cleared or holds a below-minimum/NaN value — so a transient empty field
 * doesn't store 0 and fail a positive-int payload schema on send.
 */
export function parseIntField(raw: string, fallback: number, min = 1): number {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= min ? n : fallback;
}

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
