import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

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

  return createPortal(
    <ul
      style={{ position: 'fixed', top: y, left: x, zIndex: 80 }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="min-w-44 overflow-hidden rounded-md border border-border bg-surface py-1 text-sm shadow-xl"
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
