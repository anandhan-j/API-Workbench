/** A single forward/backward schema migration expressed as raw SQL. */
export interface Migration {
  /** Monotonic version; migrations apply in ascending order. */
  version: number;
  /** Human-readable identifier, used in the ledger and logs. */
  name: string;
  /** SQL applied to move the schema forward. May contain multiple statements. */
  up: string;
  /** SQL applied to revert this migration. May contain multiple statements. */
  down: string;
}
