import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserInputField, WorkflowInputRequest } from '@shared/workflow';
import { WorkflowInputPrompt } from './WorkflowInputPrompt';

function field(overrides: Partial<UserInputField> & Pick<UserInputField, 'variable'>): UserInputField {
  return {
    kind: 'string',
    label: '',
    default: '',
    options: [],
    entries: {},
    filledAtRuntime: false,
    ...overrides,
  };
}

function request(fields: UserInputField[]): WorkflowInputRequest {
  return { workflowId: 'wf1', nodeId: 'n1', name: 'Ask', message: 'Provide values', fields };
}

describe('<WorkflowInputPrompt />', () => {
  it('renders one control per field kind and serializes the submitted values', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <WorkflowInputPrompt
        request={request([
          field({ variable: 'name', kind: 'string', label: 'Name', default: 'anna' }),
          field({ variable: 'token', kind: 'secret', label: 'Token' }),
          field({ variable: 'retries', kind: 'number', label: 'Retries', default: '3' }),
          field({ variable: 'dryRun', kind: 'boolean', label: 'Dry run', default: 'true' }),
          field({
            variable: 'env',
            kind: 'select',
            label: 'Env',
            options: ['staging', 'prod'],
            default: 'bogus', // not in options → clamps to the first
          }),
          field({
            variable: 'tags',
            kind: 'select',
            filledAtRuntime: true,
            label: 'Tags',
            default: '["a"]',
          }),
          field({ variable: 'headers', kind: 'keyvalue', label: 'Headers' }),
        ])}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password');

    await user.type(screen.getByLabelText('Name'), '-b');
    await user.clear(screen.getByLabelText('Retries'));
    await user.type(screen.getByLabelText('Retries'), '5');
    await user.click(screen.getByLabelText('Dry run')); // true → false
    await user.selectOptions(screen.getByLabelText('Env'), 'prod');
    await user.click(screen.getByRole('button', { name: /Add item/ }));
    await user.type(screen.getByLabelText('Tags item 2'), 'b');
    await user.type(screen.getAllByLabelText('Headers key')[0], 'x-a');
    await user.type(screen.getAllByLabelText('Headers value')[0], '1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'anna-b',
      token: '',
      retries: '5',
      dryRun: 'false',
      env: 'prod',
      tags: '["a","b"]',
      headers: '{"x-a":"1"}',
    });
  });

  it('prompts pre-defined select and keyvalue fields as dropdowns of their presets', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <WorkflowInputPrompt
        request={request([
          field({
            variable: 'region',
            kind: 'select',
            label: 'Region',
            options: ['us-east', 'eu-west'],
          }),
          field({
            variable: 'baseUrl',
            kind: 'keyvalue',
            label: 'Environment',
            filledAtRuntime: false,
            entries: { Production: 'https://api.example.com', Staging: 'https://staging.example.com' },
          }),
        ])}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    // Both render as selects; the keyvalue dropdown shows keys as labels.
    await user.selectOptions(screen.getByLabelText('Region'), 'eu-west');
    await user.selectOptions(screen.getByLabelText('Environment'), 'Staging');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSubmit).toHaveBeenCalledWith({
      region: 'eu-west',
      baseUrl: 'https://staging.example.com',
    });
  });

  it('degrades a choice-less dropdown to a text input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <WorkflowInputPrompt
        request={request([
          field({ variable: 'env', kind: 'select', label: 'Env', default: 'x' }),
        ])}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Env');
    expect(input.tagName).toBe('INPUT');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledWith({ env: 'x' });
  });

  it('cancels without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <WorkflowInputPrompt
        request={request([field({ variable: 'v', kind: 'string' })])}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
