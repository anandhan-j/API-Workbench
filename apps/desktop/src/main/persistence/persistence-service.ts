import type { BackupInfo } from '@shared/persistence';
import type { DatabaseConnection } from './connection';
import type { AppDatabase } from './types';
import { applyMigrations, currentVersion, type MigrationLogger } from './migrator';
import { MIGRATIONS } from './migrations';
import { withTransaction } from './transaction';
import { BackupService } from './backup-service';
import { WorkspaceRepository } from './repositories/workspace-repository';
import { ProjectRepository } from './repositories/project-repository';
import { PreferencesRepository } from './repositories/preferences-repository';
import { CacheRepository } from './repositories/cache-repository';
import { CollectionRepository } from './repositories/collection-repository';
import { FolderRepository } from './repositories/folder-repository';
import { RequestRepository } from './repositories/request-repository';
import { RequestHistoryRepository } from './repositories/request-history-repository';
import { CollectionSourceRepository } from './repositories/collection-source-repository';
import { CollectionVersionRepository } from './repositories/collection-version-repository';
import { VariableRepository } from './repositories/variable-repository';
import { AuthConfigRepository } from './repositories/auth-config-repository';
import { WorkflowRepository } from './repositories/workflow-repository';

export interface PersistenceOptions {
  backupDir: string;
  appVersion?: string;
  log?: MigrationLogger;
}

/**
 * Top-level facade for the persistence layer. Runs migrations on construction,
 * then exposes the repositories, transaction control, and the backup engine.
 */
export class PersistenceService {
  workspaces!: WorkspaceRepository;
  projects!: ProjectRepository;
  preferences!: PreferencesRepository;
  cache!: CacheRepository;
  collections!: CollectionRepository;
  folders!: FolderRepository;
  requests!: RequestRepository;
  history!: RequestHistoryRepository;
  collectionSources!: CollectionSourceRepository;
  versions!: CollectionVersionRepository;
  variables!: VariableRepository;
  authConfigs!: AuthConfigRepository;
  workflows!: WorkflowRepository;

  private readonly backupService: BackupService;

  constructor(
    private readonly connection: DatabaseConnection,
    private readonly options: PersistenceOptions,
  ) {
    this.backupService = new BackupService(connection, options.backupDir);
    this.rebuild();
  }

  private rebuild(): void {
    applyMigrations(this.connection.db, MIGRATIONS, this.options.log);
    const db = this.connection.db;
    this.workspaces = new WorkspaceRepository(db);
    this.projects = new ProjectRepository(db);
    this.preferences = new PreferencesRepository(db);
    this.cache = new CacheRepository(db);
    this.collections = new CollectionRepository(db);
    this.folders = new FolderRepository(db);
    this.requests = new RequestRepository(db);
    this.history = new RequestHistoryRepository(db);
    this.collectionSources = new CollectionSourceRepository(db);
    this.versions = new CollectionVersionRepository(db);
    this.variables = new VariableRepository(db);
    this.authConfigs = new AuthConfigRepository(db);
    this.workflows = new WorkflowRepository(db);
  }

  get db(): AppDatabase {
    return this.connection.db;
  }

  transaction<T>(fn: () => T): T {
    return withTransaction(this.connection.db, fn);
  }

  schemaVersion(): number {
    return currentVersion(this.connection.db);
  }

  createBackup(): BackupInfo {
    return this.backupService.create({
      schemaVersion: this.schemaVersion(),
      ...(this.options.appVersion ? { appVersion: this.options.appVersion } : {}),
    });
  }

  listBackups(): BackupInfo[] {
    return this.backupService.list();
  }

  restoreBackup(id: string): BackupInfo {
    const safety = this.backupService.restore(id, {
      schemaVersion: this.schemaVersion(),
      ...(this.options.appVersion ? { appVersion: this.options.appVersion } : {}),
    });
    this.rebuild();
    return safety;
  }

  pruneBackups(keep: number): number {
    return this.backupService.prune(keep);
  }

  close(): void {
    this.connection.close();
  }
}
