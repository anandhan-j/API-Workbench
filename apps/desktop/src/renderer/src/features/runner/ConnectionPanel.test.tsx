import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RequestEnvelope } from '@shared/protocol';
import type { UseConnection } from './use-connection';

const mockConn: UseConnection = {
  state: 'idle',
  events: [],
  error: null,
  open: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
};

vi.mock('./use-connection', () => ({ useConnection: () => mockConn }));

const { ConnectionPanel } = await import('./ConnectionPanel');

function wsEnvelope(): RequestEnvelope {
  return { type: 'websocket', payload: { url: 'ws://echo.test' } };
}
function sseEnvelope(): RequestEnvelope {
  return { type: 'sse', payload: { url: 'http://x/events' } };
}

describe('<ConnectionPanel />', () => {
  beforeEach(() => {
    Object.assign(mockConn, { state: 'idle', events: [], error: null });
    vi.clearAllMocks();
  });

  it('connects when idle', async () => {
    render(<ConnectionPanel envelope={wsEnvelope()} />);
    await userEvent.click(screen.getByRole('button', { name: /connect/i }));
    expect(mockConn.open).toHaveBeenCalledWith(wsEnvelope());
  });

  it('shows disconnect and enables sending once open', async () => {
    Object.assign(mockConn, { state: 'open' });
    render(<ConnectionPanel envelope={wsEnvelope()} />);
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    const input = screen.getByLabelText('WebSocket message');
    await userEvent.type(input, 'hello');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(mockConn.send).toHaveBeenCalledWith('hello');
  });

  it('disables the composer until connected', () => {
    Object.assign(mockConn, { state: 'idle' });
    render(<ConnectionPanel envelope={wsEnvelope()} />);
    expect(screen.getByLabelText('WebSocket message')).toBeDisabled();
  });

  it('hides the message composer for SSE (receive-only)', () => {
    render(<ConnectionPanel envelope={sseEnvelope()} />);
    expect(screen.queryByLabelText('WebSocket message')).not.toBeInTheDocument();
  });

  it('renders received events and an error', () => {
    Object.assign(mockConn, {
      state: 'error',
      error: 'refused',
      events: [{ at: 0, direction: 'received', kind: 'text', data: 'frame-1' }],
    });
    render(<ConnectionPanel envelope={wsEnvelope()} />);
    expect(screen.getByText('frame-1')).toBeInTheDocument();
    expect(screen.getByText('refused')).toBeInTheDocument();
  });
});
