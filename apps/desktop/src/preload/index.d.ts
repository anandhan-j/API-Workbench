import type { WorkbenchApi } from '@shared/ipc-contract';

declare global {
  interface Window {
    workbench: WorkbenchApi;
  }
}

export {};
