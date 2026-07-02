import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  INVOKE_CHANNEL_NAMES,
  type DispatchEvent,
  type IpcChannelName,
  type IpcRequest,
  type IpcResponse,
  type PluginsChangedEvent,
  type WorkbenchApi,
} from '@shared/ipc-contract';
import type { WorkflowInputRequest, WorkflowProgressEvent } from '@shared/workflow';

/**
 * Preload bridge. Exposes ONLY the enumerated invoke channels plus a single
 * typed event subscription. There is no generic "invoke arbitrary channel"
 * escape hatch — anything not in INVOKE_CHANNEL_NAMES is unreachable.
 *
 * This file is bundled (not externalized) so it can run in a sandboxed renderer
 * without requiring external node modules at runtime. See electron.vite.config.ts.
 *
 * See ADR-0003.
 */

const invokeAllowlist = new Set<string>(INVOKE_CHANNEL_NAMES);

const api: WorkbenchApi = {
  invoke<C extends IpcChannelName>(channel: C, request: IpcRequest<C>): Promise<IpcResponse<C>> {
    if (!invokeAllowlist.has(channel)) {
      return Promise.reject(new Error(`Channel "${channel}" is not allowlisted`));
    }
    return ipcRenderer.invoke(channel, request) as Promise<IpcResponse<C>>;
  },

  onDispatchEvent(listener: (event: DispatchEvent) => void): () => void {
    const handler = (_event: IpcRendererEvent, payload: DispatchEvent): void => listener(payload);
    ipcRenderer.on('dispatch.event', handler);
    return () => ipcRenderer.off('dispatch.event', handler);
  },

  onWorkflowAwaitingInput(listener: (event: WorkflowInputRequest) => void): () => void {
    const handler = (_event: IpcRendererEvent, payload: WorkflowInputRequest): void => listener(payload);
    ipcRenderer.on('workflow.awaitingInput', handler);
    return () => ipcRenderer.off('workflow.awaitingInput', handler);
  },

  onWorkflowNodeProgress(listener: (event: WorkflowProgressEvent) => void): () => void {
    const handler = (_event: IpcRendererEvent, payload: WorkflowProgressEvent): void => listener(payload);
    ipcRenderer.on('workflow.nodeProgress', handler);
    return () => ipcRenderer.off('workflow.nodeProgress', handler);
  },

  onPluginsChanged(listener: (event: PluginsChangedEvent) => void): () => void {
    const handler = (_event: IpcRendererEvent, payload: PluginsChangedEvent): void => listener(payload);
    ipcRenderer.on('plugins.changed', handler);
    return () => ipcRenderer.off('plugins.changed', handler);
  },
};

try {
  contextBridge.exposeInMainWorld('workbench', api);
} catch (error) {
  // Surfaced in the renderer DevTools console / terminal if the bridge fails to load.
  // eslint-disable-next-line no-console
  console.error('[preload] Failed to expose the workbench bridge:', error);
}
