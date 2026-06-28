import { useMutation } from '@tanstack/react-query';
import type { PreScriptRunRequest, ScriptRunRequest, ScriptRunResult } from '@shared/scripting';
import { invoke } from '../../lib/ipc';

/** Runs a post-response (`pm`) script against a response in the main process. */
export function useRunScript() {
  return useMutation<ScriptRunResult, Error, ScriptRunRequest>({
    mutationFn: (request) => invoke('script.run', request),
  });
}

/** Runs a pre-request (`pm`) script before the request is sent. */
export function useRunPreScript() {
  return useMutation<ScriptRunResult, Error, PreScriptRunRequest>({
    mutationFn: (request) => invoke('script.runPre', request),
  });
}
