import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { createPortal } from 'react-dom';
import { Box, Boxes, Redo2, Undo2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import type {
  NodePolicy,
  NodeRunResult,
  Workflow,
  WorkflowDetail,
  WorkflowGraph,
  WorkflowNode,
} from '@shared/workflow';
import { nodeTypes } from './WorkflowNodeView';
import { DND_MIME } from './NodePalette';
import { NODE_META, getNodeMeta, getPluginNodeContribution } from './node-meta';
import {
  isElementNode,
  toFlow,
  toGraph,
  type FlowNode,
  type NodeDisplayStatus,
} from './graph-mapping';
import { cloneSelection } from './selection-clone';
import { groupSelection, ungroup } from './grouping';
import {
  type History,
  canRedo,
  canUndo,
  commit as commitHistory,
  initHistory,
  redo as redoHistory,
  replace as replaceHistory,
  undo as undoHistory,
} from './history';

interface WorkflowCanvasProps {
  workflow: WorkflowDetail;
  workflows: Workflow[];
  statuses: Record<string, NodeDisplayStatus>;
  /** Reports the latest graph and selected node up to the page. */
  onGraphChange: (graph: WorkflowGraph) => void;
  onSelect: (node: FlowNode | null) => void;
  /** Bridge so the page's inspector can mutate the selected node. */
  registerMutators: (m: {
    rename: (id: string, name: string) => void;
    setConfig: (id: string, config: WorkflowNode['config']) => void;
    setPolicy: (id: string, policy: NodePolicy | undefined) => void;
    remove: (id: string) => void;
    group: () => void;
    ungroup: () => void;
    focusNode: (id: string) => void;
  }) => void;
  /** Reports whether the current selection can be grouped / ungrouped. */
  onGroupingChange?: (state: { canGroup: boolean; canUngroup: boolean }) => void;
  /** Per-node run results, keyed by node id — shown on node hover. */
  results?: Record<string, NodeRunResult>;
}

interface GraphState {
  nodes: Node[];
  edges: Edge[];
}

function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `n-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

const isTyping = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);

/**
 * The React Flow editing surface. Per ADR-0005 it carries no execution
 * semantics: it edits the domain graph and reports changes upward; the
 * main-process engine runs the result. It adds an undo/redo history, a
 * clipboard, and node grouping over the canvas.
 */
function Canvas({
  workflow,
  statuses,
  onGraphChange,
  onSelect,
  registerMutators,
  onGroupingChange,
  results = {},
}: WorkflowCanvasProps): JSX.Element {
  const initial = useMemo<GraphState>(() => {
    const f = toFlow(workflow.graph);
    return {
      nodes: f.nodes.map((n) =>
        n.type === 'group' ? n : { ...n, deletable: n.data.kind !== 'start' },
      ),
      edges: f.edges,
    };
    // Keyed on the id alone: the canvas owns its own editing history, so the
    // graph must reseed only when a *different* workflow opens — not when the
    // parent echoes back the graph this canvas just reported upward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.id]);

  const [history, setHistory] = useState<History<GraphState>>(() => initHistory(initial));
  const { nodes, edges } = history.present;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [hoverResult, setHoverResult] = useState<{ nodeId: string; x: number; y: number } | null>(
    null,
  );
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Latest values for the keyboard handler (avoids stale closures / rebinding).
  const presentRef = useRef<GraphState>(history.present);
  const selectedRef = useRef<Set<string>>(selectedIds);
  const clipboardRef = useRef<GraphState | null>(null);
  presentRef.current = history.present;
  selectedRef.current = selectedIds;

  // Reseed when the user opens a different workflow. `onSelect` is deliberately
  // not a dependency: parents pass inline handlers, and re-running this reset on
  // every parent render would wipe the user's canvas state.
  useEffect(() => {
    setHistory(initHistory(initial));
    setSelectedIds(new Set());
    onSelect(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // Overlay run statuses onto node cards whenever a run completes. Bail out
  // untouched when no node's status actually changed: `.map` would otherwise
  // return a fresh nodes array on every progress tick, churning `nodes` →
  // `displayNodes` → React Flow's selection and feeding an onSelectionChange
  // → setSelectedIds → sync-effect update loop.
  useEffect(() => {
    setHistory((h) => {
      let changed = false;
      const nodes = h.present.nodes.map((n) => {
        if (isElementNode(n) && statuses[n.id] !== n.data.status) {
          changed = true;
          return { ...n, data: { ...n.data, status: statuses[n.id] } };
        }
        return n;
      });
      return changed ? replaceHistory(h, { ...h.present, nodes }) : h;
    });
  }, [statuses]);

  // Debounced report of the current graph upward (keeps drag frames cheap).
  useEffect(() => {
    const id = setTimeout(() => onGraphChange(toGraph(nodes, edges)), 120);
    return () => clearTimeout(id);
  }, [nodes, edges, onGraphChange]);

  const apply = useCallback((producer: (s: GraphState) => GraphState, doCommit: boolean) => {
    setHistory((h) => {
      const next = producer(h.present);
      return doCommit ? commitHistory(h, next) : replaceHistory(h, next);
    });
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const worthy = changes.some(
        (c) => c.type === 'remove' || (c.type === 'position' && c.dragging === false),
      );
      apply((s) => ({ ...s, nodes: applyNodeChanges(changes, s.nodes) }), worthy);
    },
    [apply],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const worthy = changes.some((c) => c.type === 'remove');
      apply((s) => ({ ...s, edges: applyEdgeChanges(changes, s.edges) }), worthy);
    },
    [apply],
  );

  const onConnect = useCallback(
    (c: Connection) => apply((s) => ({ ...s, edges: addEdge(c, s.edges) }), true),
    [apply],
  );

  // Snapshot before a drag so undo returns to the pre-drag layout.
  const onNodeDragStart = useCallback(() => {
    setHistory((h) => ({ past: [...h.past, h.present], present: h.present, future: [] }));
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData(DND_MIME);
      // Accept built-in kinds and any plugin node kind currently contributed.
      if (!kind || !(kind in NODE_META || getPluginNodeContribution(kind))) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const meta = getNodeMeta(kind);
      const node: FlowNode = {
        id: uuid(),
        type: 'workbench',
        position,
        deletable: kind !== 'start',
        selected: true,
        data: { kind, name: meta.label, config: meta.defaultConfig() },
      };
      // Add the node selected (and deselect the rest) so its inspector opens immediately.
      apply(
        (s) => ({
          ...s,
          nodes: s.nodes.map((n): Node => ({ ...n, selected: false })).concat(node),
        }),
        true,
      );
      setSelectedIds(new Set([node.id]));
    },
    [screenToFlowPosition, apply],
  );

  // Keep the page's inspector in sync with the selected node's *current* data,
  // not just on selection change — so importing a request or editing config is
  // reflected immediately in the details panel.
  useEffect(() => {
    if (selectedIds.size !== 1) {
      onSelect(null);
      return;
    }
    const id = [...selectedIds][0];
    const node = nodes.find((n) => n.id === id);
    onSelect(node && isElementNode(node) ? node : null);
  }, [nodes, selectedIds, onSelect]);

  // --- Clipboard ---

  const copy = useCallback(() => {
    const ids = selectedRef.current;
    const els = presentRef.current.nodes.filter(
      (n): n is FlowNode => isElementNode(n) && ids.has(n.id) && n.data.kind !== 'start',
    );
    if (els.length === 0) return;
    const elIds = new Set(els.map((n) => n.id));
    const internal = presentRef.current.edges.filter(
      (e) => elIds.has(e.source) && elIds.has(e.target),
    );
    clipboardRef.current = { nodes: els, edges: internal };
  }, []);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const ids = new Set(clip.nodes.map((n) => n.id));
    const cloned = cloneSelection(clip.nodes as FlowNode[], clip.edges, ids, uuid, {
      x: 32,
      y: 32,
    });
    apply(
      (s) => ({
        nodes: s.nodes.map((n): Node => ({ ...n, selected: false })).concat(cloned.nodes),
        edges: s.edges.map((e): Edge => ({ ...e, selected: false })).concat(cloned.edges),
      }),
      true,
    );
  }, [apply]);

  const cut = useCallback(() => {
    copy();
    const ids = selectedRef.current;
    apply(
      (s) => ({
        nodes: s.nodes.filter(
          (n) => !(ids.has(n.id) && isElementNode(n) && n.data.kind !== 'start'),
        ),
        edges: s.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
      }),
      true,
    );
  }, [copy, apply]);

  const duplicate = useCallback(() => {
    copy();
    pasteClipboard();
  }, [copy, pasteClipboard]);

  // --- Grouping ---

  const doGroup = useCallback(() => {
    apply(
      (s) => ({ ...s, nodes: groupSelection(s.nodes, selectedRef.current, uuid(), 'Group') }),
      true,
    );
  }, [apply]);

  const doUngroup = useCallback(() => {
    const ids = selectedRef.current;
    const groupId =
      presentRef.current.nodes.find((n) => n.type === 'group' && ids.has(n.id))?.id ??
      presentRef.current.nodes.find((n) => isElementNode(n) && ids.has(n.id) && n.parentNode)
        ?.parentNode;
    if (groupId) apply((s) => ({ ...s, nodes: ungroup(s.nodes, groupId) }), true);
  }, [apply]);

  // Select and center a node — used by the run panel to jump to a stage's node.
  const focusNode = useCallback(
    (id: string) => {
      apply((s) => ({ ...s, nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })) }), false);
      setSelectedIds(new Set([id]));
      fitView({ nodes: [{ id }], duration: 300, padding: 0.6, maxZoom: 1.2 });
    },
    [apply, fitView],
  );

  const doUndo = useCallback(() => setHistory((h) => undoHistory(h)), []);
  const doRedo = useCallback(() => setHistory((h) => redoHistory(h)), []);

  // --- Inspector bridge ---

  useEffect(() => {
    // Push a single-node data edit to the parent's inspector copy *synchronously*
    // in the same batch as the graph update. Without this, `selectedNode` only
    // catches up via the effect above (one commit later), so a controlled input
    // in the inspector briefly re-renders with its previous value — which resets
    // the text caret to the end while typing mid-string. `presentRef` always
    // holds the latest committed state, so combining it with the edit yields the
    // same node `apply` produces.
    const reflectSelected = (id: string, mutate: (data: FlowNode['data']) => FlowNode['data']) => {
      const cur = presentRef.current.nodes.find((n) => n.id === id);
      if (cur && isElementNode(cur)) onSelect({ ...cur, data: mutate(cur.data) });
    };
    registerMutators({
      rename: (id, name) => {
        apply(
          (s) => ({
            ...s,
            nodes: s.nodes.map((n) =>
              n.id === id && isElementNode(n) ? { ...n, data: { ...n.data, name } } : n,
            ),
          }),
          true,
        );
        reflectSelected(id, (d) => ({ ...d, name }));
      },
      setConfig: (id, config) => {
        apply(
          (s) => ({
            ...s,
            nodes: s.nodes.map((n) =>
              n.id === id && isElementNode(n) ? { ...n, data: { ...n.data, config } } : n,
            ),
          }),
          true,
        );
        reflectSelected(id, (d) => ({ ...d, config }));
      },
      setPolicy: (id, policy) => {
        apply(
          (s) => ({
            ...s,
            nodes: s.nodes.map((n) =>
              n.id === id && isElementNode(n) ? { ...n, data: { ...n.data, policy } } : n,
            ),
          }),
          true,
        );
        reflectSelected(id, (d) => ({ ...d, policy }));
      },
      remove: (id) =>
        apply(
          (s) => ({
            nodes: s.nodes.filter((n) => n.id !== id),
            edges: s.edges.filter((e) => e.source !== id && e.target !== id),
          }),
          true,
        ),
      group: doGroup,
      ungroup: doUngroup,
      focusNode,
    });
  }, [registerMutators, apply, onSelect, doGroup, doUngroup, focusNode]);

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        doRedo();
      } else if (key === 'c') {
        copy();
      } else if (key === 'x') {
        cut();
      } else if (key === 'v') {
        pasteClipboard();
      } else if (key === 'd') {
        e.preventDefault();
        duplicate();
      } else if (key === 'g') {
        e.preventDefault();
        if (e.shiftKey) doUngroup();
        else doGroup();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo, copy, cut, pasteClipboard, duplicate, doGroup, doUngroup]);

  const groupableCount = useMemo(
    () => nodes.filter((n) => isElementNode(n) && selectedIds.has(n.id) && !n.parentNode).length,
    [nodes, selectedIds],
  );

  const canUngroup = useMemo(
    () =>
      nodes.some(
        (n) =>
          selectedIds.has(n.id) &&
          (n.type === 'group' || (isElementNode(n) && Boolean(n.parentNode))),
      ),
    [nodes, selectedIds],
  );

  // Report grouping availability up so the page's palette can enable/disable its
  // Group/Ungroup actions in step with the canvas selection.
  useEffect(() => {
    onGroupingChange?.({ canGroup: groupableCount >= 2, canUngroup });
  }, [groupableCount, canUngroup, onGroupingChange]);

  // --- Group rename (double-click a group's label) ---

  const commitGroupName = useCallback(
    (id: string, name: string) => {
      apply(
        (s) => ({
          ...s,
          nodes: s.nodes.map((n) =>
            n.id === id && n.type === 'group' ? { ...n, data: { ...n.data, name } } : n,
          ),
        }),
        true,
      );
      setEditingGroupId(null);
    },
    [apply],
  );

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === 'group') setEditingGroupId(node.id);
  }, []);

  // Inject the inline-rename props into the group node currently being edited.
  const displayNodes = useMemo(() => {
    if (!editingGroupId) return nodes;
    return nodes.map((n) =>
      n.id === editingGroupId && n.type === 'group'
        ? {
            ...n,
            data: {
              ...n.data,
              editing: true,
              onCommit: (name: string) => commitGroupName(n.id, name),
              onCancel: () => setEditingGroupId(null),
            },
          }
        : n,
    );
  }, [nodes, editingGroupId, commitGroupName]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeMouseEnter={(e: React.MouseEvent, node: Node) => {
          if (results[node.id]) setHoverResult({ nodeId: node.id, x: e.clientX, y: e.clientY });
        }}
        onNodeMouseLeave={() => setHoverResult(null)}
        onSelectionChange={({ nodes: sel }: { nodes: Node[]; edges: Edge[] }) => {
          const ids = sel.map((n: Node) => n.id);
          // Skip the update when the selection is unchanged: React Flow re-emits
          // this on internal re-renders, and allocating a fresh Set each time
          // would re-render for nothing (and can drive an update-depth loop).
          setSelectedIds((prev) =>
            prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids),
          );
        }}
        onDrop={onDrop}
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        deleteKeyCode={['Backspace', 'Delete']}
        onlyRenderVisibleElements
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-left" className="flex gap-1">
          <ToolbarButton label="Undo (Ctrl+Z)" onClick={doUndo} disabled={!canUndo(history)}>
            <Undo2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Redo (Ctrl+Shift+Z)" onClick={doRedo} disabled={!canRedo(history)}>
            <Redo2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Group (Ctrl+G)" onClick={doGroup} disabled={groupableCount < 2}>
            <Boxes size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Ungroup (Ctrl+Shift+G)"
            onClick={doUngroup}
            disabled={selectedIds.size === 0}
          >
            <Box size={15} />
          </ToolbarButton>
        </Panel>
        <Background gap={16} />
        <Controls />
        <MiniMap pannable zoomable className="!bg-surface" />
      </ReactFlow>
      {hoverResult && results[hoverResult.nodeId] && (
        <NodeResultHover result={results[hoverResult.nodeId]} x={hoverResult.x} y={hoverResult.y} />
      )}
    </div>
  );
}

function statusClass(status: NodeRunResult['status']): string {
  if (status === 'success') return 'bg-emerald-500/15 text-emerald-400';
  if (status === 'failed') return 'bg-rose-500/15 text-rose-400';
  return 'bg-amber-500/15 text-amber-400';
}

/** Floating card shown when hovering a node that has a run result. */
function NodeResultHover({
  result,
  x,
  y,
}: {
  result: NodeRunResult;
  x: number;
  y: number;
}): JSX.Element {
  const vars = result.variablesSet ? Object.entries(result.variablesSet) : [];
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - 272));
  const top = Math.min(y + 14, window.innerHeight - 220);
  return createPortal(
    <div
      style={{ position: 'fixed', left, top, zIndex: 70 }}
      className="pointer-events-none w-64 rounded-md border border-border bg-surface p-2.5 text-xs shadow-xl"
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
            statusClass(result.status),
          )}
        >
          {result.status}
        </span>
        <span className="truncate font-medium">{result.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted">{result.durationMs}ms</span>
      </div>
      {result.message && (
        <p className="mb-1 whitespace-pre-wrap break-words text-muted">{result.message}</p>
      )}
      {result.response && (
        <p className="mb-1 text-muted">
          <span
            className={cn(
              'font-semibold',
              result.response.ok ? 'text-emerald-400' : 'text-rose-400',
            )}
          >
            {result.response.summary.label}
          </span>
          {` · ${result.response.sizeBytes} B`}
        </p>
      )}
      {vars.length > 0 && (
        <div className="rounded border border-border">
          {vars.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-2 border-b border-border px-1.5 py-0.5 last:border-0"
            >
              <span className="shrink-0 font-mono text-muted">{k}</span>
              <span className="truncate font-mono text-fg">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** React Flow requires a provider in scope for coordinate projection. */
export function WorkflowCanvas(props: WorkflowCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

export type { FlowNode };
