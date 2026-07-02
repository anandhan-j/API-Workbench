import { useMutation } from '@tanstack/react-query';
import type { RequestEnvelope } from '@shared/protocol';
import { invoke } from '../../lib/ipc';

/** Mutation hook to execute a request through the main-process engine. */
export function useExecute() {
  return useMutation({
    mutationFn: (request: RequestEnvelope) => invoke('request.execute', { request }),
  });
}

/** Cancels an in-flight execution by id. */
export function useCancel() {
  return useMutation({
    mutationFn: (id: string) => invoke('request.cancel', { id }),
  });
}
