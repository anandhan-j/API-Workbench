import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { highlight } from '../lib/highlight';
import { cn } from '../lib/utils';

interface CodeBlockProps {
  code: string;
  lang?: string;
  /** Filename / caption shown in the header bar. */
  title?: string;
  className?: string;
}

/** Syntax-highlighted code block with a header bar and copy button. */
export function CodeBlock({ code, lang = 'ts', title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className={cn(
        'group my-5 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-[#0d0d12]',
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden>
            <i className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <i className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <i className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </span>
          {title && <span className="ml-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">{title}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{lang}</span>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy code"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <pre className="thin-scroll overflow-x-auto p-4 text-[13px] leading-6">
        <code className="font-mono">{highlight(code.trimEnd(), lang)}</code>
      </pre>
    </div>
  );
}
