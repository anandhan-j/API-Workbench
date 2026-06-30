import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  GripHorizontal,
  ListChecks,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Square,
  StepForward,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import type {
  ExtractRule,
  NodePolicy,
  NodeRunResult,
  WorkflowExport,
  WorkflowGraph,
  WorkflowInputRequest,
  WorkflowNode,
  WorkflowRunResult,
} from '@shared/workflow';
import {
  invoke,
  isBridgeAvailable,
  onWorkflowAwaitingInput,
  onWorkflowNodeProgress,
} from '../../lib/ipc';
import { usePersistentState } from '../../lib/use-persistent-state';
import { useConfirm } from '../../components/confirm/ConfirmProvider';
import { useActiveSelection, useWorkspaceDetail } from '../workspaces/use-workspaces';
import {
  useWorkflow,
  useWorkflowMutations,
  useWorkflows,
  useRunWorkflow,
  useRunControls,
} from './use-workflows';
import { useProjectRequests } from './use-project-requests';
import { requestDetailToNodeConfig } from './request-import';
import { WorkflowCanvas, type FlowNode } from './WorkflowCanvas';
import type { NodeDisplayStatus } from './graph-mapping';
import { NodePalette } from './NodePalette';
import { NodeInspector } from './NodeInspector';
import { RunPanel, type RunningNode } from './RunPanel';
import { WorkflowInputPrompt } from './WorkflowInputPrompt';
import { producedVariableNames, upstreamVariables } from './flow-variables';
import { useQueries } from '@tanstack/react-query';
import { useVariableKeys } from '../variables/use-variable-keys';
import { RuntimeValuesContext } from '../variables/runtime-values';
import type { VariableSuggestion } from '../variables/suggestion';
import type { VariableContext } from '@shared/variable';

interface Mutators {
  rename: (id: string, name: string) => void;
  setConfig: (id: string, config: WorkflowNode['config']) => void;
  setPolicy: (id: string, policy: NodePolicy | undefined) => void;
  remove: (id: string) => void;
  group: () => void;
  ungroup: () => void;
  focusNode: (id: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Live state accumulated from `workflow.nodeProgress` events during a run. */
interface RunProgress {
  statuses: Record<string, NodeDisplayStatus>;
  results: NodeRunResult[];
  current: RunningNode | null;
  /** Runtime variables accumulated so far (merged from each node's variablesSet). */
  runtime: Record<string, string>;
}

const EMPTY_PROGRESS: RunProgress = { statuses: {}, results: [], current: null, runtime: {} };

/** Collapsible section header with a chevron toggle (used by the left sidebar). */
function PanelHeader({
  title,
  collapsed,
  onToggle,
  trailing,
  icon,
  className,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  trailing?: ReactNode;
  icon?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className={`flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg ${className ?? ''}`}
    >
      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
      {icon}
      <span className="truncate">{title}</span>
      {trailing}
    </button>
  );
}

export function WorkflowsPage(): JSX.Element {
  const bridge = isBridgeAvailable();
  const active = useActiveSelection();
  const projectId = active.data?.projectId ?? null;
  const workspaceDetail = useWorkspaceDetail(active.data?.workspaceId ?? null);
  const projectName = workspaceDetail.data?.projects.find((p) => p.id === projectId)?.name ?? null;

  const workflows = useWorkflows(projectId);
  const mutations = useWorkflowMutations(projectId);
  const run = useRunWorkflow();
  const controls = useRunControls();
  const projectRequests = useProjectRequests(projectId);
  const [paused, setPaused] = useState(false);
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [inputRequest, setInputRequest] = useState<WorkflowInputRequest | null>(null);
  const [progress, setProgress] = useState<RunProgress>(EMPTY_PROGRESS);
  const [grouping, setGrouping] = useState({ canGroup: false, canUngroup: false });
  // Per-workflow run history (in memory): switching workflows restores results.
  const [runHistory, setRunHistory] = useState<Record<string, WorkflowRunResult[]>>({});
  // Which history entry is on screen per workflow (undefined = latest, null = reset).
  const [viewIndex, setViewIndex] = useState<Record<string, number | null>>({});
  // Run mode: false = run to completion, true = step one node at a time (persisted).
  const [stepMode, setStepMode] = usePersistentState('awb.workflow.stepMode', false);

  const detail = useWorkflow(selectedId);
  const graphRef = useRef<WorkflowGraph | null>(null);
  const mutatorsRef = useRef<Mutators | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Per-workflow auto-save preference (persisted across restarts).
  const [autoSaveMap, setAutoSaveMap] = usePersistentState<Record<string, boolean>>(
    'awb.workflow.autosave',
    {},
  );
  const autoSaveOn = selectedId ? Boolean(autoSaveMap[selectedId]) : false;
  const [dirtyAt, setDirtyAt] = useState(0);

  // Left sidebar layout: collapse state + draggable split height (persisted).
  const [listCollapsed, setListCollapsed] = usePersistentState('awb.workflow.listCollapsed', false);
  const [paletteCollapsed, setPaletteCollapsed] = usePersistentState(
    'awb.workflow.paletteCollapsed',
    false,
  );
  const [listHeight, setListHeight] = usePersistentState('awb.workflow.listHeight', 240);
  // Collapse state for the right inspector / run-results sections (persisted).
  const [detailsCollapsed, setDetailsCollapsed] = usePersistentState(
    'awb.workflow.detailsCollapsed',
    false,
  );
  const [resultsCollapsed, setResultsCollapsed] = usePersistentState(
    'awb.workflow.resultsCollapsed',
    false,
  );

  // Drag the divider to resize the workflow list; the palette fills the rest.
  const beginResize = useCallback(
    (e: ReactPointerEvent): void => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = listHeight;
      const onMove = (ev: PointerEvent): void => {
        setListHeight(Math.max(80, Math.min(520, startH + (ev.clientY - startY))));
      };
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [listHeight, setListHeight],
  );

  // Variables for {{ }} autocomplete in the inspector: stored vars for the
  // active workspace, plus variables produced by the selected node's upstream
  // steps (computed from the live graph, so they update as the user edits).
  const storedKeys = useVariableKeys();

  // Sub-workflow nodes expose the variables their referenced workflow sets to the
  // parent (the engine shares one runtime). Fetch those graphs so downstream
  // nodes can autocomplete them.
  const subWorkflowIds = useMemo(() => {
    const graph = graphRef.current ?? detail.data?.graph ?? null;
    if (!graph) return [];
    const ids = new Set<string>();
    for (const n of graph.nodes) {
      if (n.kind === 'sub-workflow') {
        const id = (n.config as { workflowId?: string }).workflowId;
        if (id) ids.add(id);
      }
    }
    return [...ids];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyAt, detail.data]);

  const subWorkflowQueries = useQueries({
    queries: subWorkflowIds.map((id) => ({
      queryKey: ['workflow', id],
      queryFn: () => invoke('workflow.get', { id }),
      enabled: bridge,
      staleTime: 5_000,
    })),
  });
  const subVarsSignature = subWorkflowQueries
    .map((q, i) => `${subWorkflowIds[i]}:${q.dataUpdatedAt ?? 0}`)
    .join('|');
  const subWorkflowVars = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    subWorkflowQueries.forEach((q, i) => {
      const id = subWorkflowIds[i];
      if (id && q.data) map[id] = producedVariableNames(q.data.graph);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subVarsSignature]);

  const flowSuggestions = useMemo<VariableSuggestion[]>(() => {
    const graph = graphRef.current ?? detail.data?.graph ?? null;
    if (!graph || !selectedNode) return [];
    return upstreamVariables(graph, selectedNode.id, (id) => subWorkflowVars[id] ?? []).map(
      (v) => ({
        key: v.key,
        scope: 'runtime' as const,
        secret: false,
        source: { nodeName: v.nodeName, field: v.field },
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyAt, selectedNode, detail.data, subWorkflowVars]);
  const inspectorSuggestions = useMemo<VariableSuggestion[]>(() => {
    const seen = new Set(flowSuggestions.map((sug) => sug.key));
    return [...flowSuggestions, ...storedKeys.filter((k) => !seen.has(k.key))];
  }, [flowSuggestions, storedKeys]);
  const variableContext: VariableContext | undefined = active.data?.workspaceId
    ? { workspaceId: active.data.workspaceId }
    : undefined;

  // Auto-select the first workflow as the list resolves.
  useEffect(() => {
    if (workflows.data && workflows.data.length > 0) {
      if (!selectedId || !workflows.data.some((w) => w.id === selectedId)) {
        setSelectedId(workflows.data[0].id);
      }
    } else if (workflows.data && workflows.data.length === 0) {
      setSelectedId(null);
    }
  }, [workflows.data, selectedId]);

  // The workflow whose run is in flight / most recently finished.
  const runWorkflowId = run.variables?.workflowId ?? null;

  // Subscribe to live per-node progress: highlight the running stage and stream
  // per-node results into the panel before the whole run resolves.
  useEffect(() => {
    if (!bridge) return;
    return onWorkflowNodeProgress((e) => {
      setProgress((p) => {
        if (e.phase === 'running') {
          return {
            ...p,
            statuses: { ...p.statuses, [e.nodeId]: 'running' },
            current: { nodeId: e.nodeId, kind: e.kind, name: e.name },
          };
        }
        const result = e.result;
        if (!result) return p;
        return {
          statuses: { ...p.statuses, [result.nodeId]: result.status },
          results: [...p.results, result],
          current: p.current?.nodeId === result.nodeId ? null : p.current,
          runtime: { ...p.runtime, ...(result.variablesSet ?? {}) },
        };
      });
    });
  }, [bridge]);

  // The selected workflow's stored runs and which one is on screen.
  const isRunningThis = run.isPending && runWorkflowId === selectedId;
  const selectedHistory = selectedId ? (runHistory[selectedId] ?? []) : [];
  const rawViewIndex = selectedId ? viewIndex[selectedId] : null;
  const viewIdx = rawViewIndex === undefined ? 0 : rawViewIndex;
  const displayedRun = viewIdx === null ? null : (selectedHistory[viewIdx] ?? null);

  // Canvas overlay follows whatever run is on screen — live while running, the
  // viewed history entry otherwise, nothing when reset — so the two stay in sync.
  const statuses = useMemo<Record<string, NodeDisplayStatus>>(() => {
    if (isRunningThis) return progress.statuses;
    if (!displayedRun) return {};
    const map: Record<string, NodeDisplayStatus> = {};
    for (const n of displayedRun.nodeResults) map[n.nodeId] = n.status;
    return map;
  }, [isRunningThis, progress.statuses, displayedRun]);

  // Whether the in-flight run was started in step mode, the live runtime values,
  // and per-node results — fed to the canvas (node hover) and inspector (variable
  // hover) so the user can inspect results and values as they step.
  const isStepRun = Boolean(run.variables?.stepMode);
  const runtimeValues = isRunningThis ? progress.runtime : (displayedRun?.finalVariables ?? {});
  const nodeResultMap = useMemo<Record<string, NodeRunResult>>(() => {
    const src = isRunningThis ? progress.results : (displayedRun?.nodeResults ?? []);
    const map: Record<string, NodeRunResult> = {};
    for (const r of src) map[r.nodeId] = r;
    return map;
  }, [isRunningThis, progress.results, displayedRun]);

  // F10 (or the Next button) advances a paused step run by exactly one node.
  const stepHotkey = useRef<() => boolean>(() => false);
  stepHotkey.current = () => {
    if (isStepRun && run.isPending && !progress.current && selectedId) {
      controls.step.mutate(selectedId);
      return true;
    }
    return false;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F10' && stepHotkey.current()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Filter the workflow list by name (case-insensitive).
  const filteredWorkflows = useMemo(() => {
    const list = workflows.data ?? [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((w) => w.name.toLowerCase().includes(q)) : list;
  }, [workflows.data, search]);

  const handleSave = (): void => {
    if (selectedId && graphRef.current) {
      mutations.save.mutate({ id: selectedId, graph: graphRef.current });
    }
  };

  const handleRun = (): void => {
    if (!selectedId || !graphRef.current) return;
    const id = selectedId;
    setPaused(false);
    setInputRequest(null);
    setProgress(EMPTY_PROGRESS);
    setViewIndex((v) => ({ ...v, [id]: 0 }));
    mutations.save.mutate(
      { id, graph: graphRef.current },
      {
        onSuccess: () =>
          run.mutate(
            { workflowId: id, ...(stepMode ? { stepMode: true } : {}) },
            {
              onSuccess: (result) => {
                setRunHistory((h) => ({ ...h, [id]: [result, ...(h[id] ?? [])].slice(0, 10) }));
                setViewIndex((v) => ({ ...v, [id]: 0 }));
              },
            },
          ),
      },
    );
  };

  // Clear the on-screen run (and canvas overlay) without dropping it from history.
  const handleReset = (id: string): void => {
    setViewIndex((v) => ({ ...v, [id]: null }));
    if (runWorkflowId === id) {
      setProgress(EMPTY_PROGRESS);
      run.reset();
    }
  };

  const handlePauseResume = (): void => {
    if (!selectedId) return;
    if (paused) {
      controls.resume.mutate(selectedId);
      setPaused(false);
    } else {
      controls.pause.mutate(selectedId);
      setPaused(true);
    }
  };

  const handleCancel = (): void => {
    if (selectedId) controls.cancel.mutate(selectedId);
  };

  const handleStep = (): void => {
    if (selectedId) controls.step.mutate(selectedId);
  };

  // Surface a prompt when a run suspends at a user-input node for this workflow.
  useEffect(() => {
    if (!bridge) return;
    return onWorkflowAwaitingInput((req) => setInputRequest(req));
  }, [bridge]);

  const handleProvideInput = (values: Record<string, string>): void => {
    if (!inputRequest) return;
    void invoke('workflow.provideInput', {
      workflowId: inputRequest.workflowId,
      nodeId: inputRequest.nodeId,
      values,
      cancelled: false,
    });
    setInputRequest(null);
  };

  const handleCancelInput = (): void => {
    if (!inputRequest) return;
    void invoke('workflow.provideInput', {
      workflowId: inputRequest.workflowId,
      nodeId: inputRequest.nodeId,
      values: {},
      cancelled: true,
    });
    setInputRequest(null);
  };

  // Logs a line to the dispatch monitor (no-ops gracefully outside Electron).
  const logDispatch = (
    level: 'info' | 'error',
    message: string,
    context?: Record<string, unknown>,
  ): void => {
    void invoke('dispatch.emit', {
      level,
      source: 'workflow',
      message,
      ...(context ? { context } : {}),
    });
  };

  const handleExport = async (id: string, name: string): Promise<void> => {
    try {
      const data = await mutations.exportWorkflow.mutateAsync(id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[^\w.-]+/g, '-') || 'workflow'}.workflow.json`;
      a.click();
      URL.revokeObjectURL(url);
      logDispatch('info', `Exported workflow "${name}"`, { workflowId: id });
    } catch (error) {
      logDispatch('error', `Failed to export "${name}": ${errorMessage(error)}`, {
        workflowId: id,
      });
    }
  };

  const handleImportFile = async (file: File): Promise<void> => {
    if (!projectId) return;
    try {
      const data = JSON.parse(await file.text()) as WorkflowExport;
      const wf = await mutations.importWorkflow.mutateAsync({ projectId, data });
      setSelectedId(wf.id);
      logDispatch('info', `Imported workflow "${wf.name}" from ${file.name}`, {
        workflowId: wf.id,
      });
    } catch (error) {
      logDispatch('error', `Failed to import "${file.name}": ${errorMessage(error)}`, {
        file: file.name,
      });
    }
  };

  const handleImportRequest = async (requestId: string): Promise<void> => {
    if (!selectedNode || selectedNode.data.kind !== 'request') return;
    const detail = await invoke('request.get', { id: requestId });
    const current = selectedNode.data.config as { extract?: ExtractRule[] };
    mutatorsRef.current?.setConfig(
      selectedNode.id,
      requestDetailToNodeConfig(detail, current.extract ?? []),
    );
  };

  const handleGraphChange = useCallback((g: WorkflowGraph): void => {
    graphRef.current = g;
    setDirtyAt(Date.now());
  }, []);

  const toggleAutoSave = (): void => {
    if (!selectedId) return;
    setAutoSaveMap((m) => ({ ...m, [selectedId]: !autoSaveOn }));
  };

  // Debounced per-workflow auto-save: when enabled, persist ~800ms after the
  // last graph change. `save` (react-query mutate) is referentially stable.
  const save = mutations.save.mutate;
  useEffect(() => {
    if (!autoSaveOn || !selectedId || !graphRef.current || dirtyAt === 0) return;
    const id = selectedId;
    const graph = graphRef.current;
    const timer = setTimeout(() => save({ id, graph }), 800);
    return () => clearTimeout(timer);
  }, [dirtyAt, autoSaveOn, selectedId, save]);

  if (!bridge) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Workflows</h1>
        <p className="mt-2 text-muted">
          The workflow engine requires the desktop database, available when running inside the
          application.
        </p>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Workflows</h1>
        <p className="mt-2 text-muted">Open a project in the Workspaces tab to build workflows.</p>
      </div>
    );
  }

  const runError = run.error instanceof Error ? run.error.message : null;

  return (
    <div className="flex h-full w-full flex-col p-6">
      <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-xs text-muted">
        {projectName && (
          <span className="text-fg">
            {projectName} <span className="text-muted/70">(Project)</span>
          </span>
        )}
        <span>›</span>
        <span>Workflows</span>
      </nav>
      <h1 className="mb-4 text-xl font-semibold">Workflows</h1>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: workflow list + palette */}
        <aside className="flex w-60 shrink-0 flex-col gap-3 min-h-0">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name) return;
              mutations.create.mutate(
                { projectId, name },
                { onSuccess: (wf) => setSelectedId(wf.id) },
              );
              setNewName('');
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New workflow"
              aria-label="New workflow name"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              aria-label="Create workflow"
              className="rounded-md bg-accent px-3 py-1.5 text-accent-fg"
            >
              <Plus size={15} />
            </button>
          </form>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={mutations.importWorkflow.isPending}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40"
          >
            {mutations.importWorkflow.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            Import workflow
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />

          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows by name"
              aria-label="Search workflows by name"
              className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-sm"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {/* Workflows list — collapsible, resizable */}
            <section
              className={`flex flex-col overflow-hidden rounded-md border border-border ${
                !listCollapsed && paletteCollapsed ? 'min-h-0 flex-1' : 'shrink-0'
              }`}
              style={!listCollapsed && !paletteCollapsed ? { height: listHeight } : undefined}
            >
              <PanelHeader
                title="Workflows"
                collapsed={listCollapsed}
                onToggle={() => setListCollapsed((v) => !v)}
                trailing={
                  <span className="ml-auto shrink-0 text-[11px] normal-case text-muted">
                    {filteredWorkflows.length}
                  </span>
                }
              />
              {!listCollapsed && (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {filteredWorkflows.map((w) => (
                    <div
                      key={w.id}
                      className={`group flex items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0 ${
                        w.id === selectedId ? 'bg-surface-2' : 'hover:bg-surface-2'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(w.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                      >
                        <WorkflowIcon size={14} className="shrink-0 text-muted" />
                        <span className="truncate">{w.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted">
                          {w.nodeCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Export ${w.name}`}
                        title="Export workflow"
                        onClick={() => void handleExport(w.id, w.name)}
                        className="shrink-0 text-muted opacity-0 hover:text-accent group-hover:opacity-100"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${w.name}`}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: 'Delete workflow',
                              message: `Delete workflow "${w.name}"? This cannot be undone.`,
                              confirmLabel: 'Delete',
                              danger: true,
                            })
                          ) {
                            mutations.remove.mutate(w.id);
                            if (selectedId === w.id) setSelectedId(null);
                          }
                        }}
                        className="shrink-0 text-muted opacity-0 hover:text-rose-400 group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {workflows.data?.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted">No workflows yet.</p>
                  )}
                  {workflows.data &&
                    workflows.data.length > 0 &&
                    filteredWorkflows.length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted">
                        No workflows match “{search.trim()}”.
                      </p>
                    )}
                </div>
              )}
            </section>

            {/* Drag handle to resize the split — only when both panels are open */}
            {!listCollapsed && !paletteCollapsed && (
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize workflow list"
                onPointerDown={beginResize}
                className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center rounded hover:bg-surface-2"
              >
                <GripHorizontal size={14} className="text-muted/60 group-hover:text-muted" />
              </div>
            )}

            {/* Node palette — collapsible */}
            <section
              className={`flex flex-col overflow-hidden rounded-md border border-border ${
                paletteCollapsed ? 'shrink-0' : 'min-h-[96px] flex-1'
              }`}
            >
              <PanelHeader
                title="Nodes"
                collapsed={paletteCollapsed}
                onToggle={() => setPaletteCollapsed((v) => !v)}
              />
              {!paletteCollapsed && (
                <NodePalette
                  onGroup={() => mutatorsRef.current?.group()}
                  onUngroup={() => mutatorsRef.current?.ungroup()}
                  canGroup={grouping.canGroup}
                  canUngroup={grouping.canUngroup}
                />
              )}
            </section>
          </div>
        </aside>

        {/* Center: canvas + toolbar */}
        <section className="flex min-w-0 flex-1 flex-col rounded-md border border-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="truncate text-sm font-medium">
              {detail.data?.name ?? 'Select a workflow'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={toggleAutoSave}
                disabled={!selectedId}
                title={
                  autoSaveOn
                    ? 'Auto-save is on for this workflow'
                    : 'Auto-save is off for this workflow'
                }
                aria-pressed={autoSaveOn}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 ${
                  autoSaveOn
                    ? 'border-accent text-accent'
                    : 'border-border text-muted hover:bg-surface-2'
                }`}
              >
                {autoSaveOn ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                Auto-save
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!selectedId || mutations.save.isPending}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40"
              >
                {mutations.save.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save
              </button>
              {run.isPending ? (
                isStepRun ? (
                  <>
                    <button
                      type="button"
                      onClick={handleStep}
                      disabled={Boolean(progress.current)}
                      title="Next node (F10)"
                      className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg disabled:opacity-40"
                    >
                      <StepForward size={14} /> Next
                    </button>
                    <button
                      type="button"
                      onClick={() => selectedId && controls.resume.mutate(selectedId)}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
                    >
                      <Play size={14} /> Resume
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 rounded-md border border-rose-500/40 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-500/10"
                    >
                      <Square size={14} /> Cancel
                    </button>
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      {progress.current ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Running
                        </>
                      ) : (
                        'Paused'
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handlePauseResume}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
                    >
                      {paused ? <Play size={14} /> : <Pause size={14} />}
                      {paused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 rounded-md border border-rose-500/40 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-500/10"
                    >
                      <Square size={14} /> Cancel
                    </button>
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <Loader2 size={14} className="animate-spin" /> Running
                    </span>
                  </>
                )
              ) : (
                <>
                  {displayedRun && (
                    <button
                      type="button"
                      onClick={() => selectedId && handleReset(selectedId)}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
                    >
                      <RotateCcw size={14} /> Reset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setStepMode((m) => !m)}
                    aria-pressed={stepMode}
                    title={stepMode ? 'Mode: step one node at a time' : 'Mode: run to completion'}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${
                      stepMode
                        ? 'border-accent text-accent'
                        : 'border-border text-muted hover:bg-surface-2'
                    }`}
                  >
                    <StepForward size={14} /> Step mode
                  </button>
                  <button
                    type="button"
                    onClick={handleRun}
                    disabled={!selectedId}
                    className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg disabled:opacity-40"
                  >
                    {stepMode ? <StepForward size={14} /> : <Play size={14} />}
                    {stepMode ? 'Step' : 'Run'}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {detail.data ? (
              <WorkflowCanvas
                key={detail.data.id}
                workflow={detail.data}
                workflows={(workflows.data ?? []).filter((w) => w.id !== detail.data?.id)}
                statuses={statuses}
                results={nodeResultMap}
                onGraphChange={handleGraphChange}
                onSelect={setSelectedNode}
                onGroupingChange={setGrouping}
                registerMutators={(m) => {
                  mutatorsRef.current = m;
                }}
              />
            ) : (
              <p className="p-6 text-sm text-muted">
                Create or select a workflow to open the designer.
              </p>
            )}
          </div>
        </section>

        {/* Right: inspector + run results */}
        <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-md border border-border">
          <section
            className={`flex flex-col overflow-hidden ${
              detailsCollapsed ? 'shrink-0' : 'min-h-0 flex-1'
            }`}
          >
            <PanelHeader
              title="Node Details"
              icon={<SlidersHorizontal size={12} />}
              className="bg-surface-2"
              collapsed={detailsCollapsed}
              onToggle={() => setDetailsCollapsed((v) => !v)}
            />
            {!detailsCollapsed && (
              <RuntimeValuesContext.Provider value={runtimeValues}>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  <NodeInspector
                    node={selectedNode}
                    workflows={(workflows.data ?? []).filter((w) => w.id !== selectedId)}
                    projectRequests={projectRequests.data ?? []}
                    onImportRequest={(id) => void handleImportRequest(id)}
                    onOpenWorkflow={(id) => {
                      setSelectedId(id);
                      setSelectedNode(null);
                    }}
                    suggestions={inspectorSuggestions}
                    variableContext={variableContext}
                    flowSuggestions={flowSuggestions}
                    lastResponse={
                      displayedRun?.nodeResults.find((n) => n.nodeId === selectedNode?.id)?.response
                    }
                    onRename={(name) =>
                      selectedNode && mutatorsRef.current?.rename(selectedNode.id, name)
                    }
                    onConfig={(config) =>
                      selectedNode && mutatorsRef.current?.setConfig(selectedNode.id, config)
                    }
                    onPolicy={(policy) =>
                      selectedNode && mutatorsRef.current?.setPolicy(selectedNode.id, policy)
                    }
                    onDelete={() => selectedNode && mutatorsRef.current?.remove(selectedNode.id)}
                  />
                </div>
              </RuntimeValuesContext.Provider>
            )}
          </section>
          <section
            className={`flex flex-col overflow-hidden border-t-4 border-bg ${
              resultsCollapsed ? 'shrink-0' : 'min-h-0 flex-1'
            }`}
          >
            <PanelHeader
              title="Run Results"
              icon={<ListChecks size={12} />}
              className="bg-surface-2"
              collapsed={resultsCollapsed}
              onToggle={() => setResultsCollapsed((v) => !v)}
            />
            {!resultsCollapsed && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <RunPanel
                  result={isRunningThis ? null : displayedRun}
                  running={isRunningThis}
                  error={runWorkflowId === selectedId && !displayedRun ? runError : null}
                  liveResults={isRunningThis ? progress.results : []}
                  current={isRunningThis ? progress.current : null}
                  selectedNodeId={selectedNode?.id ?? null}
                  onSelectStage={(id) => mutatorsRef.current?.focusNode(id)}
                  history={selectedHistory}
                  historyIndex={viewIdx === null ? -1 : viewIdx}
                  onSelectHistory={(i) =>
                    selectedId && setViewIndex((v) => ({ ...v, [selectedId]: i }))
                  }
                />
              </div>
            )}
          </section>
        </aside>
      </div>

      {inputRequest && (
        <WorkflowInputPrompt
          request={inputRequest}
          onSubmit={handleProvideInput}
          onCancel={handleCancelInput}
        />
      )}
    </div>
  );
}
