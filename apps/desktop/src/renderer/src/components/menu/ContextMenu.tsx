import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

/** Gap kept between the menu and the viewport edge. */
const EDGE_MARGIN = 8;

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * A small popup menu positioned at (x, y) in viewport coordinates, rendered in a
 * portal. Closes on outside click, right-click elsewhere, Escape, or selection.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ top: y, left: x });

  useEffect(() => {
    const close = (): void => onClose();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Keep the menu inside the viewport: flip up/left when it would overflow the
  // bottom/right edge, then clamp. Runs before paint so there's no flash.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxTop = window.innerHeight - height - EDGE_MARGIN;
    const maxLeft = window.innerWidth - width - EDGE_MARGIN;
    const top = y > maxTop ? y - height : y; // flip above the anchor if needed
    const left = x > maxLeft ? x - width : x; // flip left of the anchor if needed
    setPos({
      top: Math.max(EDGE_MARGIN, Math.min(top, maxTop)),
      left: Math.max(EDGE_MARGIN, Math.min(left, maxLeft)),
    });
  }, [x, y]);

  return createPortal(
    <ul
      ref={ref}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 80,
        maxHeight: `calc(100vh - ${EDGE_MARGIN * 2}px)`,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="min-w-44 overflow-y-auto rounded-md border border-border bg-surface py-1 text-sm shadow-xl"
    >
      {items.map((item, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2',
              item.danger ? 'text-danger' : 'text-fg',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  );
}
