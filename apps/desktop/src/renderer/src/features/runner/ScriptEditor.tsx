import { useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { getCaretCoordinates } from '../../lib/caret-coordinates';

/**
 * The `workbench` (alias `pm`) scripting API surface, used to drive member
 * autocomplete. Keyed by the parent path; the values are the members offered
 * after a trailing dot. `()` suffixes hint that a member is callable.
 */
const API: Record<string, string[]> = {
  '': ['workbench'],
  workbench: [
    'response',
    'request',
    'environment',
    'globals',
    'collectionVariables',
    'variables',
    'test()',
    'expect()',
  ],
  'workbench.environment': ['set()', 'get()', 'unset()', 'has()'],
  'workbench.globals': ['set()', 'get()', 'unset()', 'has()'],
  'workbench.collectionVariables': ['set()', 'get()', 'unset()', 'has()'],
  'workbench.variables': ['get()', 'set()', 'has()'],
  'workbench.response': ['json()', 'text()', 'code', 'status', 'responseTime', 'headers', 'to'],
  'workbench.response.headers': ['get()', 'has()'],
  'workbench.response.to': ['have'],
  'workbench.response.to.have': ['status()', 'header()'],
  'workbench.request': ['method', 'url', 'headers'],
  'workbench.request.headers': ['get()', 'has()'],
};

const CHAIN_RE = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.?)$/;

export interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel: string;
}

/** A code textarea with `workbench.` member autocomplete. */
export function ScriptEditor({ value, onChange, placeholder, rows = 10, ariaLabel }: ScriptEditorProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tokenStart = useRef(0);

  const recompute = (): void => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(CHAIN_RE);
    const chain = match?.[1];
    if (!chain || !(chain.startsWith('workbench') || chain.startsWith('pm') || 'workbench'.startsWith(chain))) {
      setOpen(false);
      return;
    }
    let parent: string;
    let partial: string;
    if (chain.endsWith('.')) {
      parent = chain.slice(0, -1);
      partial = '';
    } else {
      const i = chain.lastIndexOf('.');
      parent = i === -1 ? '' : chain.slice(0, i);
      partial = i === -1 ? chain : chain.slice(i + 1);
    }
    const key = parent.replace(/^pm\b/, 'workbench');
    const options = key === '' ? API[''] : (API[key] ?? []);
    const filtered = options.filter(
      (o) => o.toLowerCase().startsWith(partial.toLowerCase()) && o.replace(/\(\)$/, '') !== partial,
    );
    if (filtered.length === 0) {
      setOpen(false);
      return;
    }
    tokenStart.current = caret - partial.length;
    // Anchor the dropdown just below the caret (start of the token being typed).
    const c = getCaretCoordinates(el, tokenStart.current);
    setCoords({ top: c.top - el.scrollTop + c.height + 4, left: c.left - el.scrollLeft });
    setItems(filtered);
    setActive(0);
    setOpen(true);
  };

  const insert = (member: string): void => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const isCall = member.endsWith('()');
    const text = isCall ? member.slice(0, -2) : member;
    const next = value.slice(0, tokenStart.current) + text + (isCall ? '(' : '') + value.slice(caret);
    onChange(next);
    const pos = tokenStart.current + text.length + (isCall ? 1 : 0);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = pos;
      el.focus();
    });
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insert(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          requestAnimationFrame(recompute);
        }}
        onKeyUp={(e) => {
          if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) recompute();
        }}
        onClick={recompute}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        aria-label={ariaLabel}
        spellCheck={false}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs"
      />
      {open && (
        <ul
          style={{ top: coords.top, left: coords.left }}
          className="absolute z-20 max-h-48 w-56 overflow-auto rounded-md border border-border bg-surface py-1 text-xs shadow-lg"
        >
          {items.map((it, i) => (
            <li key={it}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(it);
                }}
                className={cn(
                  'block w-full px-3 py-1 text-left font-mono',
                  i === active ? 'bg-accent text-accent-fg' : 'hover:bg-surface-2',
                )}
              >
                {it}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
