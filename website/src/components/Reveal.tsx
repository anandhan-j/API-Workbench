import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Seconds to delay the entrance. */
  delay?: number;
  /** Entrance direction. */
  from?: 'up' | 'down' | 'left' | 'right' | 'scale' | 'none';
  className?: string;
  /** Re-animate every time it enters the viewport (default: once). */
  repeat?: boolean;
}

const offsets = {
  up: { y: 28, x: 0, scale: 1 },
  down: { y: -28, x: 0, scale: 1 },
  left: { y: 0, x: 28, scale: 1 },
  right: { y: 0, x: -28, scale: 1 },
  scale: { y: 0, x: 0, scale: 0.92 },
  none: { y: 0, x: 0, scale: 1 },
} as const;

/** Scroll-reveal wrapper: fades/slides children in when they enter the viewport. */
export function Reveal({ children, delay = 0, from = 'up', className, repeat = false }: RevealProps) {
  const reduce = useReducedMotion();
  const o = offsets[from];

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...o }}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once: !repeat, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container: children with <StaggerItem> animate in sequence. */
export function Stagger({ children, className, stagger = 0.08 }: { children: ReactNode; className?: string; stagger?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] } },
      }}
    >
      {children}
    </motion.div>
  );
}
