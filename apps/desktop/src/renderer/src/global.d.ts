import type { WorkbenchApi } from '@shared/ipc-contract';

declare global {
  interface Window {
    /** Bridge exposed by the preload script; absent outside Electron. */
    workbench?: WorkbenchApi;
  }
}

export {};
