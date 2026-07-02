import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { FormSchema, formDefaults } from '@shared/forms';
import { SchemaForm } from './SchemaForm';

const schema = FormSchema.parse({
  fields: [
    { key: 'host', kind: 'string', label: 'Host', placeholder: 'example.com', required: true },
    { key: 'body', kind: 'textarea', label: 'Body', language: 'json' },
    { key: 'port', kind: 'number', label: 'Port', min: 1, max: 65535, integer: true },
    { key: 'tls', kind: 'boolean', label: 'Use TLS' },
    {
      key: 'mode',
      kind: 'select',
      label: 'Mode',
      options: [
        { value: 'fast', label: 'Fast' },
        { value: 'safe', label: 'Safe' },
      ],
    },
    { key: 'token', kind: 'secret', label: 'Token' },
    { key: 'metadata', kind: 'keyvalue', label: 'Metadata' },
  ],
});

/** Controlled harness so typing accumulates across keystrokes. */
function Harness({ onChange }: { onChange: (v: Record<string, unknown>) => void }): JSX.Element {
  const [value, setValue] = useState<Record<string, unknown>>(() => formDefaults(schema));
  return (
    <SchemaForm
      schema={schema}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('<SchemaForm />', () => {
  it('renders every field kind with its label', () => {
    render(<SchemaForm schema={schema} value={formDefaults(schema)} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Host/)).toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    expect(screen.getByLabelText('Port')).toBeInTheDocument();
    expect(screen.getByLabelText('Use TLS')).toBeInTheDocument();
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Token')).toBeInTheDocument();
    expect(screen.getByLabelText('Metadata key')).toBeInTheDocument();
  });

  it('masks secret fields as password inputs', () => {
    render(<SchemaForm schema={schema} value={formDefaults(schema)} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password');
  });

  it('emits string, textarea, and secret edits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText(/Host/), 'api.example.com');
    await user.type(screen.getByLabelText('Body'), '"raw"');
    await user.type(screen.getByLabelText('Token'), 's3cret');

    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.host).toBe('api.example.com');
    expect(last.body).toBe('"raw"');
    expect(last.token).toBe('s3cret');
  });

  it('emits number edits as numbers and clears to undefined', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText('Port'), '8080');
    expect((onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>).port).toBe(8080);

    await user.clear(screen.getByLabelText('Port'));
    expect((onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>).port).toBeUndefined();
  });

  it('emits boolean and select edits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByLabelText('Use TLS'));
    expect((onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>).tls).toBe(true);

    await user.selectOptions(screen.getByLabelText('Mode'), 'safe');
    expect((onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>).mode).toBe('safe');
  });

  it('builds a record from keyvalue rows and removes rows', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getAllByLabelText('Metadata key')[0], 'region');
    await user.type(screen.getAllByLabelText('Metadata value')[0], 'eu');
    expect((onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>).metadata).toEqual({
      region: 'eu',
    });

    await user.click(screen.getByRole('button', { name: 'Remove row' }));
    expect((onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>).metadata).toEqual({});
  });

  it('shows field errors and descriptions', () => {
    const withDescription = FormSchema.parse({
      fields: [{ key: 'host', kind: 'string', label: 'Host', description: 'Server hostname.' }],
    });
    render(
      <SchemaForm
        schema={withDescription}
        value={{}}
        onChange={vi.fn()}
        errors={{ host: 'Required' }}
      />,
    );
    expect(screen.getByText('Server hostname.')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
