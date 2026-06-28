import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExecutionResponse } from '@shared/execution';
import { ResponseViewer } from './ResponseViewer';

function res(over: Partial<ExecutionResponse> = {}): ExecutionResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: '{"a":1}',
    bodyKind: 'json',
    prettyBody: '{\n  "a": 1\n}',
    contentType: 'application/json',
    sizeBytes: 7,
    timings: { startedAt: 0, totalMs: 42 },
    redirects: [],
    retries: 0,
    ...over,
  };
}

describe('<ResponseViewer />', () => {
  it('shows an empty state with no response', () => {
    render(<ResponseViewer response={null} />);
    expect(screen.getByText('No response yet.')).toBeInTheDocument();
  });

  it('renders status, timing, and pretty JSON body', () => {
    render(<ResponseViewer response={res()} />);
    expect(screen.getByText('200 OK')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    expect(screen.getByTestId('response-body').textContent).toContain('"a": 1');
  });

  it('renders an error response', () => {
    render(<ResponseViewer response={res({ ok: false, status: 0, error: 'ECONNREFUSED', bodyKind: 'empty', prettyBody: undefined, body: '' })} />);
    expect(screen.getByTestId('response-error').textContent).toContain('ECONNREFUSED');
  });

  it('notes a binary body', () => {
    render(<ResponseViewer response={res({ bodyKind: 'binary', prettyBody: undefined, body: 'AQID', sizeBytes: 3 })} />);
    expect(screen.getByTestId('response-body').textContent).toContain('binary');
  });
});
