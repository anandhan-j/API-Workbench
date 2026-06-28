import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ResolvedKey } from '@shared/variable';
import { VariableField } from './VariableField';

const keys: ResolvedKey[] = [
  { key: 'baseUrl', scope: 'global', secret: false },
  { key: 'token', scope: 'workspace', secret: true },
];

function Harness(): JSX.Element {
  const [v, setV] = useState('');
  return (
    <>
      <VariableField value={v} onChange={setV} suggestions={keys} aria-label="field" />
      <output data-testid="val">{v}</output>
    </>
  );
}

function type(value: string): void {
  fireEvent.change(screen.getByLabelText('field'), {
    target: { value, selectionStart: value.length },
  });
}

describe('<VariableField />', () => {
  it('shows no suggestions without an open token', () => {
    render(<Harness />);
    type('hello');
    expect(screen.queryByTestId('variable-suggestions')).not.toBeInTheDocument();
  });

  it('suggests all variables right after {{', () => {
    render(<Harness />);
    type('{{');
    expect(screen.getByTestId('variable-suggestions')).toBeInTheDocument();
    expect(screen.getByText('baseUrl')).toBeInTheDocument();
    expect(screen.getByText('token')).toBeInTheDocument();
    expect(screen.getByText('(secret)')).toBeInTheDocument();
  });

  it('filters by the partial query', () => {
    render(<Harness />);
    type('{{tok');
    expect(screen.getByText('token')).toBeInTheDocument();
    expect(screen.queryByText('baseUrl')).not.toBeInTheDocument();
  });

  it('inserts {{key}} when a suggestion is chosen', () => {
    render(<Harness />);
    type('{{ba');
    fireEvent.mouseDown(screen.getByText('baseUrl'));
    expect(screen.getByTestId('val').textContent).toBe('{{baseUrl}}');
  });

  it('completes a token mid-text', () => {
    render(<Harness />);
    type('https://{{ba');
    fireEvent.mouseDown(screen.getByText('baseUrl'));
    expect(screen.getByTestId('val').textContent).toBe('https://{{baseUrl}}');
  });

  it('highlights known vs unknown tokens in the backdrop', () => {
    function Static(): JSX.Element {
      return <VariableField value="x {{baseUrl}} {{nope}}" onChange={() => {}} suggestions={keys} aria-label="field" />;
    }
    render(<Static />);
    expect(screen.getByText('{{baseUrl}}')).toHaveClass('text-accent'); // known
    expect(screen.getByText('{{nope}}')).toHaveClass('text-warning'); // unknown
  });
});
