import type { ResolvedKey } from '@shared/variable';

/**
 * A variable offered for autocomplete. Either a stored, resolvable variable
 * (a {@link ResolvedKey}: global/workspace/collection/…) or a *flow* variable
 * produced by an upstream workflow step. Flow variables have no value until the
 * workflow runs, so they carry `source` (where they come from) instead and are
 * surfaced with a "step" badge.
 */
export interface VariableSuggestion extends ResolvedKey {
  /** Present for flow variables produced by an earlier workflow step. */
  source?: { nodeName: string; field: string };
}
