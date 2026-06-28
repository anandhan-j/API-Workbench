import { Check, X } from 'lucide-react';
import type { TestReport } from '@shared/testing';
import { cn } from '../../lib/cn';

export interface TestReportViewProps {
  report: TestReport | null;
}

/** Read-only test report: a pass/fail summary and per-assertion results. */
export function TestReportView({ report }: TestReportViewProps): JSX.Element | null {
  if (!report) return null;
  return (
    <div className="rounded-md border border-border bg-surface p-3" data-testid="test-report">
      <p className="text-sm font-semibold">
        <span className={report.failed === 0 ? 'text-success' : 'text-danger'}>
          {report.passed}/{report.total} passed
        </span>{' '}
        <span className="text-muted">· {report.durationMs} ms</span>
      </p>
      <ul className="mt-2 space-y-1">
        {report.results.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {r.passed ? (
              <Check size={15} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <X size={15} className="mt-0.5 shrink-0 text-danger" />
            )}
            <span className="min-w-0">
              <span className="font-medium">{r.name}</span>
              <span className={cn('ml-2 text-xs', r.passed ? 'text-muted' : 'text-danger')}>{r.message}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
