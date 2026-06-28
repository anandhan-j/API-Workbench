import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyValueEditor } from './KeyValueEditor';
import { newRow, type KeyValue } from './build-request';

function Harness(): JSX.Element {
  const [rows, setRows] = useState<KeyValue[]>([newRow()]);
  return (
    <>
      <KeyValueEditor rows={rows} onChange={setRows} />
      <output data-testid="count">{rows.filter((r) => r.key).length}</output>
    </>
  );
}

describe('<KeyValueEditor />', () => {
  it('auto-appends a trailing row as you type and tracks values', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    // one blank row initially → one key input
    expect(screen.getAllByLabelText('Key')).toHaveLength(1);

    await user.type(screen.getAllByLabelText('Key')[0], 'Authorization');
    // a new trailing blank row should have appeared
    expect(screen.getAllByLabelText('Key').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('removes a row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getAllByLabelText('Key')[0], 'X');
    expect(screen.getByTestId('count').textContent).toBe('1');
    await user.click(screen.getAllByLabelText('Remove row')[0]);
    expect(screen.getByTestId('count').textContent).toBe('0');
  });
});
