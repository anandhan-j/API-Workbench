import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:brightness-110',
  secondary:
    'border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-white',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2.5',
};

interface ButtonProps {
  children: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  ariaLabel?: string;
}

/** Button that renders as router Link, anchor, or button depending on props. */
export function Button({ children, to, href, onClick, variant = 'primary', size = 'md', className, ariaLabel }: ButtonProps) {
  const classes = cn(
    'inline-flex select-none items-center justify-center rounded-xl font-semibold transition-all duration-200 active:scale-[0.97]',
    VARIANTS[variant],
    SIZES[size],
    className
  );
  if (to) {
    return (
      <Link to={to} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-600 dark:text-brand-300',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Card with hover lift + border glow, used across feature/gallery grids. */
export function LiftCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn(
        'group relative rounded-2xl border border-zinc-200 bg-white p-6 shadow-card transition-colors hover:border-brand-400/50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:shadow-card-dark dark:hover:border-brand-500/40',
        className
      )}
    >
      {children}
    </motion.div>
  );
}

/** Section heading block with eyebrow, title, and lede. */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  center = true,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  center?: boolean;
}) {
  return (
    <div className={cn('mb-12 max-w-3xl', center && 'mx-auto text-center')}>
      {eyebrow && (
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-500 dark:text-brand-400">{eyebrow}</p>
      )}
      <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">{title}</h2>
      {lede && <p className="mt-4 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">{lede}</p>}
    </div>
  );
}
