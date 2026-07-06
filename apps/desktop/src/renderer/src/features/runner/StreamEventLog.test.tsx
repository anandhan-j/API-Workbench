import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { StreamEvent } from '@shared/protocol';
import { StreamEventLog } from './StreamEventLog';

function ev(direction: StreamEvent['direction'], data: string, kind = 'text'): StreamEvent {
  return { at: 0, direction, kind, data };
}

describe('<StreamEventLog />', () => {
  it('shows an empty state with no events', () => {
    render(<StreamEventLog events={[]} />);
    expect(screen.getByText('No events.')).toBeInTheDocument();
  });

  it('renders each event with its data and a non-default kind chip', () => {
    render(
      <StreamEventLog
        events={[ev('sent', 'ping'), ev('received', 'pong'), ev('received', '{"n":1}', 'tick')]}
      />,
    );
    expect(screen.getByText('ping')).toBeInTheDocument();
    expect(screen.getByText('pong')).toBeInTheDocument();
    // The SSE event name (non-"message" kind) is shown as a chip.
    expect(screen.getByText('tick')).toBeInTheDocument();
  });

  it('renders info and error events', () => {
    render(<StreamEventLog events={[ev('info', 'connected', 'open'), ev('error', 'boom', 'error')]} />);
    expect(screen.getByText('connected')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
