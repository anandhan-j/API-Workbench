import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DispatchEvent } from '@shared/ipc-contract';
import { DispatchMonitor } from './DispatchMonitor';
import { useDispatchStore } from '../../stores/dispatch-store';

let counter = 0;
const makeEvent = (level: DispatchEvent['level'], message: string): DispatchEvent => ({
  id: `e${counter++}`,
  timestamp: Date.now(),
  level,
  source: 'test',
  message,
});

describe('<DispatchMonitor />', () => {
  beforeEach(() => {
    useDispatchStore.setState({ events: [], levelFilter: 'all', paused: false });
  });

  it('shows an empty state when there are no events', () => {
    render(<DispatchMonitor />);
    expect(screen.getByText('No events yet.')).toBeInTheDocument();
  });

  it('renders buffered events', () => {
    useDispatchStore.getState().setEvents([
      makeEvent('info', 'application ready'),
      makeEvent('error', 'boom'),
    ]);
    render(<DispatchMonitor />);
    expect(screen.getByText('application ready')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('filters events by level when a filter is clicked', async () => {
    const user = userEvent.setup();
    useDispatchStore.getState().setEvents([
      makeEvent('info', 'info message'),
      makeEvent('error', 'error message'),
    ]);
    render(<DispatchMonitor />);

    await user.click(screen.getByRole('button', { name: 'error' }));
    expect(screen.getByText('error message')).toBeInTheDocument();
    expect(screen.queryByText('info message')).not.toBeInTheDocument();
  });

  it('toggles pause state', async () => {
    const user = userEvent.setup();
    render(<DispatchMonitor />);
    await user.click(screen.getByRole('button', { name: 'Pause stream' }));
    expect(useDispatchStore.getState().paused).toBe(true);
  });
});
