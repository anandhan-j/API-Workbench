/**
 * Abstraction over a database that can serialize itself to bytes and be restored
 * from bytes. This keeps the backup engine independent of the concrete SQLite
 * driver: production backs it with better-sqlite3's `serialize()`/file, and tests
 * back it with sql.js's `export()`/constructor.
 */
export interface DatabaseSnapshotSource {
  /** Serialize the entire current database to a byte array. */
  snapshot(): Uint8Array;
  /** Replace the live database contents with the given snapshot bytes. */
  restore(bytes: Uint8Array): void;
}
