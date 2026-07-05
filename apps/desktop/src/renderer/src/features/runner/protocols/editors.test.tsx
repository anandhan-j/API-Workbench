import { useState } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GRAPHQL_REQUEST_TYPE,
  GRPC_REQUEST_TYPE,
  SSE_REQUEST_TYPE,
  WEBSOCKET_REQUEST_TYPE,
} from '@shared/protocol';
import { defaultProtocolPayload } from '../build-request';
import type { ProtocolEditorProps } from './types';
import { GraphqlEditor } from './GraphqlEditor';
import { GrpcEditor } from './GrpcEditor';
import { WebSocketEditor } from './WebSocketEditor';
import { SseEditor } from './SseEditor';
import { CollectSettingsEditor } from './CollectSettingsEditor';
import { RecordEditor } from './RecordEditor';

const invoke = vi.fn(async () => ({ canceled: false, path: 'C:/protos/svc.proto' }));
vi.mock('../../../lib/ipc', () => ({ invoke: (...a: unknown[]) => invoke(...(a as [])) }));

/** Renders an editor as a controlled component and exposes its live value. */
function Harness({
  Editor,
  type,
}: {
  Editor: (props: ProtocolEditorProps) => JSX.Element;
  type: string;
}): JSX.Element {
  const [value, setValue] = useState<Record<string, unknown>>(defaultProtocolPayload(type));
  return (
    <>
      <Editor value={value} onChange={setValue} suggestions={[]} />
      <pre data-testid="state">{JSON.stringify(value)}</pre>
    </>
  );
}

function state(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('state').textContent ?? '{}');
}

describe('protocol editors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GraphqlEditor edits the query into the payload', async () => {
    render(<Harness Editor={GraphqlEditor} type={GRAPHQL_REQUEST_TYPE} />);
    await userEvent.type(screen.getByLabelText('GraphQL query'), '{{}');
    expect(String(state().query)).toContain('{');
  });

  it('GrpcEditor edits fields, toggles TLS, and browses the proto path', async () => {
    render(<Harness Editor={GrpcEditor} type={GRPC_REQUEST_TYPE} />);
    await userEvent.type(screen.getByLabelText('gRPC service'), 'greeter.Greeter');
    expect(state().service).toBe('greeter.Greeter');

    await userEvent.click(screen.getByRole('checkbox', { name: /use tls/i }));
    expect(state().useTls).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: /browse/i }));
    expect(invoke).toHaveBeenCalledWith('dialog.openPath', expect.anything());
    // The picked path is applied asynchronously.
    expect(await screen.findByDisplayValue('C:/protos/svc.proto')).toBeInTheDocument();
  });

  it('WebSocketEditor adds, edits, and removes scripted messages', async () => {
    render(<Harness Editor={WebSocketEditor} type={WEBSOCKET_REQUEST_TYPE} />);
    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    expect((state().messages as unknown[]).length).toBe(1);

    await userEvent.type(screen.getByLabelText('Message 1'), 'ping');
    expect((state().messages as { data: string }[])[0].data).toContain('ping');

    await userEvent.click(screen.getByRole('button', { name: /remove message 1/i }));
    expect((state().messages as unknown[]).length).toBe(0);
  });

  it('WebSocketEditor parses comma-separated subprotocols', async () => {
    render(<Harness Editor={WebSocketEditor} type={WEBSOCKET_REQUEST_TYPE} />);
    await userEvent.type(screen.getByLabelText('WebSocket subprotocols'), 'graphql-ws, json');
    expect(state().subprotocols).toEqual(['graphql-ws', 'json']);
  });

  it('SseEditor reveals the body field only for POST', async () => {
    render(<Harness Editor={SseEditor} type={SSE_REQUEST_TYPE} />);
    expect(screen.queryByLabelText('SSE request body')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('SSE method'), 'POST');
    expect(state().method).toBe('POST');
    expect(screen.getByLabelText('SSE request body')).toBeInTheDocument();
  });

  it('CollectSettingsEditor edits the limits', async () => {
    function CollectHarness(): JSX.Element {
      const [value, setValue] = useState({ maxEvents: 50, durationMs: 10000 });
      return (
        <>
          <CollectSettingsEditor value={value} onChange={setValue} />
          <pre data-testid="state">{JSON.stringify(value)}</pre>
        </>
      );
    }
    render(<CollectHarness />);
    const max = screen.getByLabelText('Max events');
    await userEvent.clear(max);
    await userEvent.type(max, '5');
    expect(state()).toEqual({ maxEvents: 5, durationMs: 10000 });
  });

  it('RecordEditor flattens edited rows into a record', async () => {
    function RecordHarness(): JSX.Element {
      const [value, setValue] = useState<Record<string, string>>({});
      return (
        <>
          <RecordEditor value={value} onChange={setValue} keyPlaceholder="Header" />
          <pre data-testid="state">{JSON.stringify(value)}</pre>
        </>
      );
    }
    render(<RecordHarness />);
    const grid = screen.getByTestId('kv-editor');
    // Typing into the first row spawns a trailing blank row, so target row 0.
    await userEvent.type(within(grid).getAllByLabelText('Header')[0], 'X-Api-Key');
    await userEvent.type(within(grid).getAllByLabelText('Value')[0], 'secret');
    expect(state()).toEqual({ 'X-Api-Key': 'secret' });
  });
});
