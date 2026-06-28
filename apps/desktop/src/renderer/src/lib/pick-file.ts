import { invoke, isBridgeAvailable } from './ipc';

export interface PickedFile {
  name: string;
  base64: string;
  size: number;
}

/**
 * Opens the native file picker (in the main process) and returns the chosen
 * file's name, base64 content, and size. Returns null if cancelled or if the
 * desktop bridge is unavailable (e.g. running in a browser).
 */
export async function pickFile(): Promise<PickedFile | null> {
  if (!isBridgeAvailable()) return null;
  const res = await invoke('dialog.openFile', {});
  if (res.canceled || !res.name || res.base64 === undefined) return null;
  return { name: res.name, base64: res.base64, size: res.size ?? 0 };
}

/** Formats a byte count as a short human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
