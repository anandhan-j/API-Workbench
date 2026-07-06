import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExecutionResponse } from '@shared/execution';
import { toProtocolResponse, type ProtocolResponse } from '@shared/protocol';
import { ResponseViewer } from './ResponseViewer';

function res(over: Partial<ExecutionResponse> = {}): ProtocolResponse {
  return toProtocolResponse({
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
  });
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

  it('renders headers from the metadata map and HTTP extras when present', () => {
    render(<ResponseViewer response={res({ headers: { 'x-request-id': 'abc' }, redirects: ['https://a/'], retries: 2 })} />);
    expect(screen.getByText('Headers (1)')).toBeInTheDocument();
    expect(screen.getByText('x-request-id')).toBeInTheDocument();
    expect(screen.getByText('2 retries')).toBeInTheDocument();
    expect(screen.getByText('1 redirects')).toBeInTheDocument();
  });

  it('falls back to the summary tone when HTTP extras are absent', () => {
    const generic: ProtocolResponse = {
      ...res(),
      type: 'plugin:demo/msg',
      summary: { label: 'DELIVERED', tone: 'success' },
      protocol: undefined,
    };
    render(<ResponseViewer response={generic} />);
    expect(screen.getByText('DELIVERED')).toBeInTheDocument();
  });

  it('renders the GraphQL errors section when the operation returned errors', () => {
    const gql: ProtocolResponse = {
      ...res({ ok: false }),
      type: 'graphql',
      summary: { label: '200 OK · 1 GraphQL error', tone: 'error', code: '200' },
      protocol: {
        status: 200,
        statusText: 'OK',
        headers: {},
        redirects: [],
        retries: 0,
        graphqlErrors: [{ message: 'field missing', path: ['user', 'id'] }],
      },
    };
    render(<ResponseViewer response={gql} />);
    expect(screen.getByText('GraphQL errors (1)')).toBeInTheDocument();
    expect(screen.getByText('field missing')).toBeInTheDocument();
    expect(screen.getByText('@ user.id')).toBeInTheDocument();
  });

  it('renders the gRPC status strip', () => {
    const grpc: ProtocolResponse = {
      ...res(),
      type: 'grpc',
      summary: { label: '5 NOT_FOUND', tone: 'error', code: '5' },
      protocol: { statusCode: 5, statusName: 'NOT_FOUND', metadata: {}, trailers: { 'grpc-message': 'nope' } },
    };
    render(<ResponseViewer response={grpc} />);
    // "5 NOT_FOUND" shows in both the summary chip and the gRPC strip.
    expect(screen.getAllByText('5 NOT_FOUND').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('grpc-message:')).toBeInTheDocument();
  });

  it('renders the stream event timeline for WebSocket/SSE responses', () => {
    const stream: ProtocolResponse = {
      ...res(),
      type: 'websocket',
      summary: { label: 'Closed 1000 · 1 message', tone: 'success' },
      body: '["pong"]',
      prettyBody: '["pong"]',
      protocol: {
        events: [
          { at: 0, direction: 'sent', kind: 'text', data: 'ping' },
          { at: 1, direction: 'received', kind: 'text', data: 'pong' },
        ],
        closeCode: 1000,
      },
    };
    render(<ResponseViewer response={stream} />);
    expect(screen.getByText(/Events \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('ping')).toBeInTheDocument();
    expect(screen.getByText('pong')).toBeInTheDocument();
  });
});
