import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { HttpProtocolExtras, statusOf, type ProtocolResponse } from '@shared/protocol';
import { cn } from '../../lib/cn';

export interface ResponseViewerProps {
  response: ProtocolResponse | null;
  loading?: boolean;
}

function statusColor(status: number, ok: boolean): string {
  if (status === 0) return 'bg-danger text-accent-fg';
  if (ok) return 'bg-success text-accent-fg';
  if (status >= 400) return 'bg-danger text-accent-fg';
  return 'bg-warning text-accent-fg';
}

/** Chip colour when no HTTP extras are available: fall back to the summary tone. */
const TONE_COLOR: Record<ProtocolResponse['summary']['tone'], string> = {
  success: 'bg-success text-accent-fg',
  error: 'bg-danger text-accent-fg',
  info: 'bg-warning text-accent-fg',
};

/**
 * Read-only response viewer. The frame is protocol-agnostic — summary chip,
 * timings, size, metadata table, and body panes render for any
 * {@link ProtocolResponse} — with an HTTP-extras strip (redirects, retries)
 * shown only when the response carries parseable HTTP extras.
 */
export function ResponseViewer({ response, loading }: ResponseViewerProps): JSX.Element {
  const bodyRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  // Scope Ctrl/Cmd+A to the response body: when the user is interacting with it
  // (it holds focus, or the caret/selection sits inside it), select only its
  // contents instead of letting the browser select the entire app. A document
  // listener is used because a click in the pane doesn't reliably move focus to
  // it, so an element-level handler would never fire.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || (e.key !== 'a' && e.key !== 'A')) return;
      const el = bodyRef.current;
      if (!el) return;
      const active = document.activeElement;
      // Leave real text inputs alone — their own select-all should still work.
      if (
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return;
      }
      const selection = window.getSelection();
      const insideBody =
        el.contains(active) || (!!selection?.anchorNode && el.contains(selection.anchorNode));
      if (!insideBody || !selection) return;
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (loading) return <p className="p-4 text-sm text-muted">Sending…</p>;
  if (!response) return <p className="p-4 text-sm text-muted">No response yet.</p>;

  if (response.error && statusOf(response) === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-sm text-danger" data-testid="response-error">
          {response.cancelled ? 'Cancelled' : `Error: ${response.error}`}
        </p>
      </div>
    );
  }

  const extras = HttpProtocolExtras.safeParse(response.protocol);
  const chipColor = extras.success
    ? statusColor(extras.data.status, response.ok)
    : TONE_COLOR[response.summary.tone];

  const isBinary = response.bodyKind === 'binary';
  const bodyText = isBinary ? '' : (response.prettyBody ?? response.body ?? '');

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm">
        <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', chipColor)}>
          {response.summary.label}
        </span>
        <span className="text-muted">{response.timings.totalMs} ms</span>
        <span className="text-muted">{response.sizeBytes} B</span>
        <span className="text-muted">{response.bodyKind}</span>
        {extras.success && (
          <>
            {extras.data.retries > 0 && (
              <span className="text-muted">{extras.data.retries} retries</span>
            )}
            {extras.data.redirects.length > 0 && (
              <span className="text-muted">{extras.data.redirects.length} redirects</span>
            )}
          </>
        )}
      </div>

      <details className="border-b border-border px-4 py-2 text-sm">
        <summary className="cursor-pointer text-muted">Headers ({Object.keys(response.metadata).length})</summary>
        <table className="mt-2 w-full font-mono text-xs">
          <tbody>
            {Object.entries(response.metadata).map(([k, v]) => (
              <tr key={k}>
                <td className="pr-3 align-top text-muted">{k}</td>
                <td className="break-all">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <div className="relative">
        {!isBinary && bodyText !== '' && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(bodyText)
                .then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                })
                .catch(() => undefined);
            }}
            aria-label="Copy response body"
            title={copied ? 'Copied' : 'Copy response'}
            className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-muted shadow-sm hover:text-fg"
          >
            {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
        <pre
          ref={bodyRef}
          tabIndex={0}
          className="max-h-96 overflow-auto p-4 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
          data-testid="response-body"
        >
          {isBinary ? `[binary ${response.sizeBytes} bytes, base64]` : bodyText}
        </pre>
      </div>
    </div>
  );
}
