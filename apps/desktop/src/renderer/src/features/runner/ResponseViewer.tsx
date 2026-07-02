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

      <pre className="max-h-96 overflow-auto p-4 font-mono text-xs" data-testid="response-body">
        {response.bodyKind === 'binary'
          ? `[binary ${response.sizeBytes} bytes, base64]`
          : (response.prettyBody ?? response.body)}
      </pre>
    </div>
  );
}
