import { createContext, useContext } from 'react';

/**
 * Live runtime variable values for the workflow run currently on screen, keyed by
 * variable name. Provided by the workflows page around the node inspector so a
 * `{{token}}` hover can show the value a variable actually holds in this run
 * (during step-through or after a finished run), instead of only the stored
 * config value. Empty everywhere else (e.g. the standalone runner).
 */
export const RuntimeValuesContext = createContext<Record<string, string>>({});

export function useRuntimeValues(): Record<string, string> {
  return useContext(RuntimeValuesContext);
}
