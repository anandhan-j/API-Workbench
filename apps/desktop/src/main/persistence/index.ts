/**
 * Persistence layer public surface.
 *
 * Driver-agnostic exports (schema, service, repositories, migrator, backup) are
 * safe to import anywhere. The production connection (`database.ts`) is imported
 * separately by the composition root because it pulls in the native driver.
 */
export * as schema from './schema';
export { PersistenceService, type PersistenceOptions } from './persistence-service';
export { applyMigrations, rollbackTo, currentVersion, type MigrationLogger } from './migrator';
export { MIGRATIONS, type Migration } from './migrations';
export { withTransaction } from './transaction';
export { BackupService, type BackupContext } from './backup-service';
export type { DatabaseConnection } from './connection';
export type { DatabaseSnapshotSource } from './snapshot';
export type { AppDatabase } from './types';
export { PersistenceError, NotFoundError, ConflictError } from './types';
export { createBetterSqliteConnection, BetterSqliteConnection } from './database';

export { WorkspaceRepository } from './repositories/workspace-repository';
export { ProjectRepository } from './repositories/project-repository';
export { PreferencesRepository } from './repositories/preferences-repository';
export { CacheRepository } from './repositories/cache-repository';
