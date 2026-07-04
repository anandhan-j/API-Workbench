import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PluginDialogRequest } from '@shared/plugins';
import { PluginDialogHost } from './PluginDialogHost';

/** Installs a stub bridge whose dialog-request emitter the test controls. */
function setupBridge(): {
  emit: (request: PluginDialogRequest) => void;
  invoke: ReturnType<typeof vi.fn>;
} {
  let listener: ((request: PluginDialogRequest) => void) | undefined;
  const invoke = vi.fn(async () => ({}));
  (window as unknown as { workbench: unknown }).workbench = {
    invoke,
    onDispatchEvent: () => () => undefined,
    onWorkflowAwaitingInput: () => () => undefined,
    onWorkflowNodeProgress: () => () => undefined,
    onPluginsChanged: () => () => undefined,
    onPluginDialogRequest: (l: (request: PluginDialogRequest) => void) => {
      listener = l;
      return () => undefined;
    },
  };
  return { emit: (request) => act(() => listener?.(request)), invoke };
}

function makeRequest(overrides: Partial<PluginDialogRequest> = {}): PluginDialogRequest {
  return {
    dialogId: 'd1',
    pluginId: 'com.acme.tools',
    pluginName: 'Acme Tools',
    title: 'Approval required',
    message: 'Deploy to production?',
    form: {
      fields: [
        {
          kind: 'select',
          key: 'decision',
          label: 'Decision',
          required: false,
          substituteVariables: true,
          options: [
            { value: 'approve', label: 'Approve' },
            { value: 'reject', label: 'Reject' },
          ],
        },
        {
          kind: 'string',
          key: 'comment',
          label: 'Comment',
          required: false,
          substituteVariables: true,
        },
      ],
    },
    okLabel: 'Submit',
    cancelLabel: 'Dismiss',
    ...overrides,
  };
}

describe('<PluginDialogHost />', () => {
  afterEach(() => {
    delete (window as { workbench?: unknown }).workbench;
    vi.restoreAllMocks();
  });

  it('renders nothing until a dialog request arrives', () => {
    setupBridge();
    render(<PluginDialogHost />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the dialog with provenance and submits the collected values', async () => {
    const user = userEvent.setup();
    const { emit, invoke } = setupBridge();
    render(<PluginDialogHost />);
    emit(makeRequest());

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Acme Tools/)).toBeInTheDocument();
    expect(screen.getByText('Deploy to production?')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Decision'), 'reject');
    await user.type(screen.getByLabelText('Comment'), 'not yet');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(invoke).toHaveBeenCalledWith('plugin.dialogRespond', {
      dialogId: 'd1',
      values: { decision: 'reject', comment: 'not yet' },
      cancelled: false,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('replies cancelled when dismissed and shows queued dialogs one at a time', async () => {
    const user = userEvent.setup();
    const { emit, invoke } = setupBridge();
    render(<PluginDialogHost />);
    emit(makeRequest({ dialogId: 'first', title: 'First' }));
    emit(makeRequest({ dialogId: 'second', title: 'Second' }));

    expect(screen.getByRole('dialog', { name: 'First' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(invoke).toHaveBeenCalledWith('plugin.dialogRespond', {
      dialogId: 'first',
      values: {},
      cancelled: true,
    });

    // The next queued dialog appears once the first is settled.
    expect(screen.getByRole('dialog', { name: 'Second' })).toBeInTheDocument();
  });

  it('blocks submission until required fields validate', async () => {
    const user = userEvent.setup();
    const { emit, invoke } = setupBridge();
    render(<PluginDialogHost />);
    emit(
      makeRequest({
        form: {
          fields: [
            {
              kind: 'string',
              key: 'reason',
              label: 'Reason',
              required: true,
              substituteVariables: true,
            },
          ],
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Reason/), 'ship it');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(invoke).toHaveBeenCalledWith('plugin.dialogRespond', {
      dialogId: 'd1',
      values: { reason: 'ship it' },
      cancelled: false,
    });
  });
});
