import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TestReport } from '@shared/testing';
import { TestReportView } from './TestReportView';

const report: TestReport = {
  total: 2,
  passed: 1,
  failed: 1,
  durationMs: 3,
  results: [
    { name: 'Status', type: 'status', passed: true, message: 'status 200 equals 200' },
    { name: 'Body id', type: 'body', passed: false, message: '$.id = undefined' },
  ],
};

describe('<TestReportView />', () => {
  it('renders nothing without a report', () => {
    const { container } = render(<TestReportView report={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the summary and per-assertion results', () => {
    render(<TestReportView report={report} />);
    expect(screen.getByText('1/2 passed')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Body id')).toBeInTheDocument();
    expect(screen.getByText('$.id = undefined')).toBeInTheDocument();
  });
});
