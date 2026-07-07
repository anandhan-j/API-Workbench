import { join } from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import appIcon from '../../resources/icon.png?asset';
import {
  registerIpcHandlers,
  attachDispatchStream,
  notifyPluginsChanged,
  notifyMcpStatusChanged,
  notifyWorkflowsChanged,
  notifyAiChatEvent,
  notifyAiDataChanged,
  requestPluginDialog,
} from './ipc';
import { logger } from './services/logger';
import { FileLogSink } from './services/file-log-sink';
import { createBetterSqliteConnection, PersistenceService } from './persistence';
import { WorkspaceManager } from './workspace';
import { CollectionExplorer } from './collections';
import { ImportService, SyncService, builtinOpenApiImporters, DEFAULT_IMPORTER_ID } from './openapi';
import { VersioningService } from './versioning';
import { VariableService, SafeStorageEncryptor } from './variables';
import { AuthService } from './auth';
import {
  ExecutionService,
  FetchTransport,
  createHttpProvider,
  createGraphqlProvider,
  createGrpcProvider,
  createGrpcInvoker,
  createWebSocketProvider,
  createSseProvider,
  createSseStreamer,
  type PluginConnectionPort,
} from './execution';
import { TestRunner } from './testing';
import { WorkflowService, BUILTIN_NODE_EXECUTORS } from './workflows';
import {
  AuthProviderRegistry,
  CapabilityBroker,
  ImporterRegistry,
  NodeExecutorRegistry,
  PluginHostManager,
  PluginService,
  RequestTypeRegistry,
} from './plugins';
import { createUtilityProcessTransport } from './plugins/host-transport-electron';
import {
  PREF_MCP_PORT,
  PREF_MCP_PORT_ASSIGNED,
  PREF_MCP_TLS,
  PREF_MCP_TOKEN,
  PREF_VERIFY_SSL,
} from '@shared/persistence';
import { randomUUID } from 'node:crypto';
import { McpServerManager, spawnMcpChild, createAppRpcHandler } from './mcp';
import { AiProviderStore, AssistantService } from './ai';

/**
 * Main process entry point.
 *
 * Owns the application lifecycle, opens the local database, composes the
 * application services, and creates the single hardened BrowserWindow. Security
 * posture (ADR-0003): context isolation on, node integration off, sandbox on,
 * navigation and new-window creation blocked by default.
 */

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = process.env['ELECTRON_RENDERER_URL'];

let persistence: PersistenceService | undefined;
let pluginHostRef: PluginHostManager | undefined;
let mcpServerRef: McpServerManager | undefined;

interface Services {
  persistence: PersistenceService;
  workspaces: WorkspaceManager;
  collections: CollectionExplorer;
  imports: ImportService;
  sync: SyncService;
  versioning: VersioningService;
  variables: VariableService;
  auth: AuthService;
  execution: ExecutionService;
  testRunner: TestRunner;
  workflows: WorkflowService;
  plugins: PluginService;
  pluginHost: PluginHostManager;
  requestTypes: RequestTypeRegistry;
  pluginConnections: PluginConnectionPort;
  mcp: McpServerManager;
  aiProviders: AiProviderStore;
  assistant: AssistantService;
}

function initServices(): Services {
  const userData = app.getPath('userData');
  const dbPath = join(userData, 'data', 'workbench.db');
  const backupDir = join(userData, 'backups');
  const connection = createBetterSqliteConnection(dbPath);
  const service = new PersistenceService(connection, {
    backupDir,
    appVersion: app.getVersion(),
    log: (level, message, context) => logger.log(level, 'persistence', message, context),
  });
  persistence = service;
  logger.info('persistence', 'Database ready', {
    schemaVersion: service.schemaVersion(),
    dbPath,
  });
  const collections = new CollectionExplorer(service);
  const variables = new VariableService(service, new SafeStorageEncryptor());
  const workspaces = new WorkspaceManager(service, { appVersion: app.getVersion() });

  // Phase 16 (ADR-0007/0009): the four extension registries. Built-ins seed
  // them here; the plugin host manager adds RPC-backed entries per plugin.
  const nodeExecutors = new NodeExecutorRegistry(BUILTIN_NODE_EXECUTORS);
  const authProviders = new AuthProviderRegistry();
  const importers = new ImporterRegistry(builtinOpenApiImporters(), DEFAULT_IMPORTER_ID);
  // The transport reads the "verify TLS certificates" preference per request, so
  // toggling it in Settings takes effect immediately for both the runner and
  // workflow request nodes (which share this transport).
  const verifySsl = (): boolean => service.preferences.getOrDefault<boolean>(PREF_VERIFY_SSL, true);
  const transport = new FetchTransport(verifySsl);
  // Built-in request-type providers (ADR-0009). HTTP is #1; the rest add
  // GraphQL, gRPC unary, and WebSocket/SSE (the streams run in one-shot
  // collect mode). Each takes an injected transport/client port.
  const requestTypes = new RequestTypeRegistry([
    createHttpProvider(transport),
    createGraphqlProvider(transport),
    createGrpcProvider(createGrpcInvoker()),
    createWebSocketProvider(),
    createSseProvider(createSseStreamer(verifySsl)),
  ]);

  const auth = new AuthService(service, new SafeStorageEncryptor(), authProviders);
  const execution = new ExecutionService(transport, {
    evaluate: (template, context) => variables.evaluate({ template, context }),
    // Stored-credential decryption and plugin auth providers live in AuthService;
    // the dispatcher hands it the envelope's auth source per request (ADR-0009).
    resolveArtifacts: (source, ctx, evaluate) => auth.resolveArtifacts(source, ctx, evaluate),
    requestTypes,
  });
  // Workflow nodes reuse the execution and variable engines: request nodes run
  // through the same execution path (with stored-credential resolution), and
  // set-variable nodes evaluate templates against the run's variable context.
  const workflows = new WorkflowService(service, {
    executeRequest: (config, ctx, signal) =>
      execution.run(
        {
          ...config,
          variableContext: {
            ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
            workflowId: ctx.workflowId,
            runtime: ctx.runtime,
          },
        },
        signal,
      ),
    evaluate: (template, ctx) =>
      variables.evaluate({
        template,
        context: {
          ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
          workflowId: ctx.workflowId,
          runtime: ctx.runtime,
        },
      }),
    setVariable: (scope, key, value, ctx) =>
      variables.set({
        scope,
        ...(scope === 'workspace' && ctx.workspaceId ? { scopeId: ctx.workspaceId } : {}),
        key,
        value,
      }),
    appVersion: app.getVersion(),
    nodeExecutors,
  });

  // Plugin host wiring (ADR-0010): the broker enforces capability grants on
  // every host→main call; the manager owns the utility process and registers
  // each activated plugin's contributions into the registries above.
  const pluginLog = (level: 'info' | 'warn' | 'error', message: string, context?: object): void => {
    logger.log(level, 'plugins', message, context as Record<string, unknown> | undefined);
  };
  const broker = new CapabilityBroker({
    persistence: service,
    evaluate: (template) => variables.evaluate({ template, context: {} }),
    setVariable: (scope, key, value) => {
      const active = workspaces.getActiveSelection();
      variables.set({
        scope,
        ...(scope === 'workspace' && active.workspaceId ? { scopeId: active.workspaceId } : {}),
        key,
        value,
      });
    },
    showDialog: (request) => requestPluginDialog(request),
    log: pluginLog,
  });
  const pluginHost = new PluginHostManager({
    spawn: () => createUtilityProcessTransport(join(__dirname, 'plugin-host.js')),
    broker,
    registries: { nodes: nodeExecutors, auth: authProviders, importers, requestTypes },
    log: pluginLog,
    onChanged: (reason) => notifyPluginsChanged(reason),
  });
  const plugins = new PluginService(service, {
    installRoot: join(userData, 'plugins'),
    host: pluginHost,
    log: pluginLog,
  });
  pluginHostRef = pluginHost;

  const mcp = new McpServerManager({
    spawn: (args) => spawnMcpChild(args, (message) => logger.info('mcp', message)),
    initialPort: service.preferences.getOrDefault<number>(PREF_MCP_PORT, 0),
    initialTls: service.preferences.getOrDefault<boolean>(PREF_MCP_TLS, true),
    initialToken: service.preferences.getOrDefault<string>(PREF_MCP_TOKEN, ''),
    generateToken: () => randomUUID(),
    // Persist the token so it stays stable across restarts; the manager reports
    // the initial mint and every explicit refresh here.
    onTokenChanged: (token) => service.preferences.set(PREF_MCP_TOKEN, token),
    // Remember the OS-assigned port so the server keeps the same port (and URL)
    // across restarts, like the token — and falls back to a fresh one if it's
    // taken. Kept separate from the user's port preference above.
    initialAssignedPort: service.preferences.getOrDefault<number>(PREF_MCP_PORT_ASSIGNED, 0),
    onAssignedPortChanged: (port) => service.preferences.set(PREF_MCP_PORT_ASSIGNED, port),
    onStatusChanged: (status) => notifyMcpStatusChanged(status),
    // Back-channel: a workflow authored in an AI client can be imported straight
    // into the running app (reusing the app's own import path) so it appears in
    // the workflow list. Imports are additive (fresh ids) — non-destructive.
    handleAppRpc: createAppRpcHandler({
      importWorkflow: (data, projectId) => workflows.importWorkflow({ projectId, data }),
      getActiveProjectId: () => workspaces.getActiveSelection().projectId,
      onImported: (projectId) => notifyWorkflowsChanged(projectId, 'mcp-import'),
    }),
    log: (message) => logger.info('mcp', message),
  });
  mcpServerRef = mcp;

  // AI assistant (ADR-0012). Keys are encrypted with the same safeStorage-backed
  // Encryptor as the auth store; the read-only tools call the same collection,
  // workflow, and variable services the IPC handlers use — in-process, no MCP
  // round trip. Streamed output reaches the renderer via `ai.chat.event`.
  const aiProviders = new AiProviderStore(service, new SafeStorageEncryptor());
  const versioning = new VersioningService(service);
  const assistant = new AssistantService(
    service,
    aiProviders,
    {
      collections,
      workflows,
      variables,
      activeSelection: () => workspaces.getActiveSelection(),
    },
    (event) => notifyAiChatEvent(event),
    undefined,
    // Auto-snapshot before AI writes so every edit is reversible; best-effort.
    (collectionId, label) => versioning.snapshot(collectionId, label),
    // Refresh renderer views the assistant edits (collections, workflows, variables).
    (event) => notifyAiDataChanged(event),
  );

  return {
    persistence: service,
    workspaces,
    collections,
    imports: new ImportService(service, { importers }),
    sync: new SyncService(service),
    versioning,
    variables,
    auth,
    execution,
    testRunner: new TestRunner(),
    workflows,
    plugins,
    pluginHost,
    requestTypes,
    pluginConnections: pluginHost,
    mcp,
    aiProviders,
    assistant,
  };
}

/** Presents a fatal startup error clearly instead of crashing with an unhandled rejection. */
function handleFatalStartupError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('app', 'Fatal startup error', { message });

  const isAbiMismatch = /NODE_MODULE_VERSION|was compiled against a different Node/i.test(message);
  const hint = isAbiMismatch
    ? '\n\nThe native SQLite module was built for a different runtime. ' +
      'Rebuild it for Electron by running:\n\n  npm run rebuild:native\n\n' +
      '(or: npx @electron/rebuild -f -w better-sqlite3)'
    : '';

  dialog.showErrorBox('API Workbench failed to start', `${message}${hint}`);
  app.quit();
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d12',
    title: 'API Workbench',
    // Windows takes the taskbar icon from the packaged exe; on Linux (and dev)
    // the window/taskbar icon comes from here. macOS uses the .app bundle icon.
    ...(process.platform !== 'darwin' ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
    logger.info('app', 'Main window shown');
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (RENDERER_DEV_URL && url.startsWith(RENDERER_DEV_URL)) return;
    event.preventDefault();
    logger.warn('app', 'Blocked in-app navigation', { url });
  });

  const detach = attachDispatchStream(window);
  window.on('closed', detach);

  if (isDev && RENDERER_DEV_URL) {
    void window.loadURL(RENDERER_DEV_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

app.whenReady().then(() => {
  try {
    // Start persistent file logging first so everything below — including a fatal
    // startup error — is captured to disk for debugging.
    const logDir = app.getPath('logs');
    const sink = new FileLogSink(logDir);
    sink.attach(logger);
    logger.info('app', 'File logging started', { file: sink.filePath });

    const services = initServices();
    registerIpcHandlers(services, { logFilePath: () => sink.filePath });
    // Activate installed plugins in the background; per-plugin failures are
    // logged and surfaced on the Plugins page rather than blocking startup.
    void services.plugins.activateInstalled();
    logger.info('app', 'Application ready', {
      version: app.getVersion(),
      platform: process.platform,
    });
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  } catch (error) {
    handleFatalStartupError(error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  mcpServerRef?.dispose();
  pluginHostRef?.dispose();
  persistence?.close();
});

process.on('uncaughtException', (error) => {
  logger.error('app', 'Uncaught exception in main process', {
    message: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : undefined;
  logger.error('app', 'Unhandled promise rejection in main process', {
    message: error?.message ?? String(reason),
    stack: error?.stack,
  });
});
