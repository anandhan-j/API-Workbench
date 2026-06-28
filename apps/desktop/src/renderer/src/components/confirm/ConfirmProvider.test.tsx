import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm } from './ConfirmProvider';

function Harness(): JSX.Element {
  const confirm = useConfirm();
  const [result, setResult] = useState('none');
  return (
    <>
      <button type="button" onClick={async () => setResult(String(await confirm({ message: 'Sure?' })))}>
        ask
      </button>
      <output data-testid="result">{result}</output>
    </>
  );
}

describe('ConfirmProvider / useConfirm', () => {
  it('resolves true when confirmed', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <Harness />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'ask' }));
    expect(screen.getByText('Sure?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('true'));
    expect(screen.queryByText('Sure?')).not.toBeInTheDocument();
  });

  it('resolves false when cancelled', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <Harness />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'ask' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('false'));
  });
});
