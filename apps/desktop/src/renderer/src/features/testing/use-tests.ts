import { useMutation } from '@tanstack/react-query';
import type { RunTestsRequest } from '@shared/testing';
import { invoke } from '../../lib/ipc';

/** Runs assertions against an execution response in the main process. */
export function useRunTests() {
  return useMutation({
    mutationFn: (request: RunTestsRequest) => invoke('test.run', request),
  });
}
