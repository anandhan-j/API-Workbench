import { memo, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from '../../lib/cn';
import { NODE_META } from './node-meta';
import type { FlowNodeData, GroupNodeData } from './graph-mapping';

/**
 * The custom React Flow node renderers. They are purely presentational — they
 * draw a node from its domain data and expose connection handles. Branch nodes
 * (condition/switch/loop) and nodes that route errors render multiple labelled
 * source handles whose ids match the domain edge `sourceHandle`s the engine
 * follows. All execution semantics live in the main-process engine (ADR-0005).
 */

interface SourceHandle {
  id: string | undefined;
  label: string;
  error?: boolean;
}

/** The labelled source handles a node exposes, derived from its kind + config. */
function sourceHandles(data: FlowNodeData): SourceHandle[] {
  const base: SourceHandle[] = (() => {
    switch (data.kind) {
      case 'end':
        return [];
      case 'condition':
        return [
          { id: 'true', label: 'true' },
          { id: 'false', label: 'false' },
        ];
      case 'switch': {
        const cases = (data.config as { cases?: string[] }).cases ?? [];
        return [
          ...cases.map((c) => ({ id: c, label: c || '∅' })),
          { id: 'default', label: 'default' },
        ];
      }
      case 'loop':
        return [
          { id: 'body', label: 'body' },
          { id: 'done', label: 'done' },
        ];
      default:
        return [{ id: undefined, label: '' }];
    }
  })();
  if (data.policy?.onError === 'route') base.push({ id: 'error', label: 'error', error: true });
  return base;
}

export const WorkflowNodeView = memo(function WorkflowNodeView({
  data,
  selected,
}: NodeProps<FlowNodeData>): JSX.Element {
  const meta = NODE_META[data.kind];
  const Icon = meta.icon;
  const handles = sourceHandles(data);
  // The ring conveys run status (or a plain border when idle); selection is shown
  // as a separate offset outline so it stays visible on top of a status ring —
  // i.e. you can still tell a post-run node is selected.
  const statusRing =
    data.status === 'running'
      ? 'ring-2 ring-accent animate-pulse'
      : data.status === 'success'
        ? 'ring-2 ring-emerald-500'
        : data.status === 'failed'
          ? 'ring-2 ring-rose-500'
          : data.status === 'skipped'
            ? 'ring-2 ring-amber-500'
            : selected
              ? 'ring-2 ring-accent'
              : 'ring-1 ring-border';
  const selectedOutline = selected ? 'outline outline-2 outline-offset-2 outline-accent' : '';

  return (
    <div
      className={cn('relative w-44 rounded-lg bg-surface shadow-sm', statusRing, selectedOutline)}
    >
      {data.kind !== 'start' && (
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-muted" />
      )}
      {data.status === 'running' && (
        <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow">
          <Loader2 size={12} className="animate-spin" />
        </span>
      )}
      <div className={cn('flex items-center gap-2 rounded-t-lg px-2.5 py-1.5', meta.accent)}>
        <Icon size={14} className="shrink-0" />
        <span className="truncate text-xs font-semibold">{meta.label}</span>
      </div>
      <div className="px-2.5 py-1.5">
        <p className="truncate text-xs font-medium text-fg">{data.name || meta.label}</p>
        <p className="truncate text-[11px] text-muted">{summarize(data)}</p>
      </div>
      {handles.map((h, i) => {
        const top = `${((i + 1) / (handles.length + 1)) * 100}%`;
        return (
          <Handle
            key={h.id ?? 'out'}
            type="source"
            position={Position.Right}
            {...(h.id ? { id: h.id } : {})}
            style={{ top }}
            className={cn('!h-2.5 !w-2.5', h.error ? '!bg-rose-500' : '!bg-muted')}
          >
            {h.label && (
              <span className="pointer-events-none absolute left-3 -translate-y-1/2 whitespace-nowrap text-[9px] text-muted">
                {h.label}
              </span>
            )}
          </Handle>
        );
      })}
    </div>
  );
});

export const GroupNodeView = memo(function GroupNodeView({
  data,
  selected,
}: NodeProps<GroupNodeData>): JSX.Element {
  return (
    <div
      className={cn(
        'h-full w-full rounded-lg border border-dashed bg-surface-2/30',
        selected ? 'border-accent' : 'border-border',
      )}
    >
      {data.editing ? (
        <GroupNameEditor
          initial={data.name}
          onCommit={(name) => data.onCommit?.(name)}
          onCancel={() => data.onCancel?.()}
        />
      ) : (
        <span
          className="absolute left-2 top-1 text-[11px] font-semibold text-muted"
          title="Double-click to rename"
        >
          {data.name || 'Group'}
        </span>
      )}
    </div>
  );
});

/** Inline editor for a group's name; mounted only while the group is being renamed. */
function GroupNameEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = (): void => onCommit(value.trim() || 'Group');
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      aria-label="Group name"
      className="nodrag nopan absolute left-2 top-1 w-[calc(100%-1rem)] rounded border border-accent bg-surface px-1 py-0.5 text-[11px] font-semibold text-fg outline-none"
    />
  );
}

/** A one-line summary of a node's configuration for the card body. */
function summarize(data: FlowNodeData): string {
  switch (data.kind) {
    case 'request': {
      const c = data.config as { method?: string; url?: string };
      return `${c.method ?? 'GET'} ${c.url || '—'}`;
    }
    case 'set-variable': {
      const c = data.config as { key?: string; value?: string };
      return c.key ? `${c.key} = ${c.value ?? ''}` : 'unset';
    }
    case 'delay': {
      const c = data.config as { ms?: number };
      return `${c.ms ?? 0} ms`;
    }
    case 'condition': {
      const c = data.config as { expression?: string };
      return c.expression || 'no expression';
    }
    case 'switch': {
      const c = data.config as { value?: string };
      return c.value || 'no value';
    }
    case 'loop': {
      const c = data.config as { mode?: string; times?: number };
      return c.mode === 'times' ? `repeat ${c.times ?? 0}×` : 'while …';
    }
    case 'transform': {
      const c = data.config as { variable?: string; engine?: string };
      return c.variable ? `${c.variable} ← ${c.engine ?? 'template'}` : 'unset';
    }
    case 'end': {
      const c = data.config as { outcome?: string };
      return c.outcome === 'fail' ? 'ends the run as failed' : 'ends the run';
    }
    case 'sub-workflow':
      return 'runs another workflow';
    case 'user-input': {
      const c = data.config as { fields?: unknown[] };
      const count = c.fields?.length ?? 0;
      return count ? `prompts for ${count} value${count === 1 ? '' : 's'}` : 'pauses for the user';
    }
    default:
      return '';
  }
}

export const nodeTypes = { workbench: WorkflowNodeView, group: GroupNodeView };
