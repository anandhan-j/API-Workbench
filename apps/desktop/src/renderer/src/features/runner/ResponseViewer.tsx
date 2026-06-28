import type { ExecutionResponse } from '@shared/execution';
import { cn } from '../../lib/cn';

export interface ResponseViewerProps {
  response: ExecutionResponse | null;
  loading?: boolean;
}

function statusColor(status: number, ok: boolean): string {
  if (status === 0) return 'bg-danger text-accent-fg';
  if (ok) return 'bg-success text-accent-fg';
  if (status >= 400) return 'bg-danger text-accent-fg';
  return 'bg-warning text-accent-fg';
}

/** Read-only response viewer: status, metrics, headers, and a pretty body. */
export function ResponseViewer({ response, loading }: ResponseViewerProps): JSX.Element {
  if (loading) return <p className="p-4 text-sm text-muted">Sending…</p>;
  if (!response) return <p className="p-4 text-sm text-muted">No response yet.</p>;

  if (response.error && response.status === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-sm text-danger" data-testid="response-error">
          {response.cancelled ? 'Cancelled' : `Error: ${response.error}`}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm">
        <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', statusColor(response.status, response.ok))}>
          {response.status} {response.statusText}
        </span>
        <span className="text-muted">{response.timings.totalMs} ms</span>
        <span className="text-muted">{response.sizeBytes} B</span>
        <span className="text-muted">{response.bodyKind}</span>
        {response.retries > 0 && <span className="text-muted">{response.retries} retries</span>}
        {response.redirects.length > 0 && <span className="text-muted">{response.redirects.length} redirects</span>}
      </div>

      <details className="border-b border-border px-4 py-2 text-sm">
        <summary className="cursor-pointer text-muted">Headers ({Object.keys(response.headers).length})</summary>
        <table className="mt-2 w-full font-mono text-xs">
          <tbody>
            {Object.entries(response.headers).map(([k, v]) => (
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
