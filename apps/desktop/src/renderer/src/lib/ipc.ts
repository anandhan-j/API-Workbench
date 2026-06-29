import type {
  DispatchEvent,
  IpcChannelName,
  IpcRequest,
  IpcResponse,
  WorkbenchApi,
} from '@shared/ipc-contract';
import type { WorkflowInputRequest, WorkflowProgressEvent } from '@shared/workflow';

/**
 * Renderer-side IPC client. Wraps the preload bridge and provides a safe fallback
 * when the bridge is absent (unit tests, plain-browser dev), so the UI degrades
 * gracefully instead of throwing on `window.workbench`.
 */

const fallback: WorkbenchApi = {
  invoke<C extends IpcChannelName>(_channel: C, _request: IpcRequest<C>): Promise<IpcResponse<C>> {
    return Promise.reject(new Error('IPC bridge unavailable (running outside Electron)'));
  },
  onDispatchEvent(_listener: (event: DispatchEvent) => void): () => void {
    return () => undefined;
  },
  onWorkflowAwaitingInput(_listener: (event: WorkflowInputRequest) => void): () => void {
    return () => undefined;
  },
  onWorkflowNodeProgress(_listener: (event: WorkflowProgressEvent) => void): () => void {
    return () => undefined;
  },
};

export function getBridge(): WorkbenchApi {
  return typeof window !== 'undefined' && window.workbench ? window.workbench : fallback;
}

export function isBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.workbench);
}

export function invoke<C extends IpcChannelName>(
  channel: C,
  request: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  return getBridge().invoke(channel, request);
}

export function onDispatchEvent(listener: (event: DispatchEvent) => void): () => void {
  return getBridge().onDispatchEvent(listener);
}

export function onWorkflowAwaitingInput(
  listener: (event: WorkflowInputRequest) => void,
): () => void {
  return getBridge().onWorkflowAwaitingInput(listener);
}

export function onWorkflowNodeProgress(
  listener: (event: WorkflowProgressEvent) => void,
): () => void {
  return getBridge().onWorkflowNodeProgress(listener);
}
