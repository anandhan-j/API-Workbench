import type { WorkflowNodeKind } from '@shared/workflow';
import { NODE_META, PALETTE_KINDS } from './node-meta';

/**
 * The draggable node palette. Dragging a chip onto the canvas adds a node of
 * that kind (handled by the canvas's onDrop). The kind travels via the native
 * drag dataTransfer under a private MIME type.
 */
export const DND_MIME = 'application/x-workbench-node';

export function NodePalette(): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Nodes</p>
      {PALETTE_KINDS.map((kind) => (
        <PaletteItem key={kind} kind={kind} />
      ))}
      <p className="mt-2 px-1 text-[11px] text-muted">Drag onto the canvas, then connect.</p>
    </div>
  );
}

function PaletteItem({ kind }: { kind: WorkflowNodeKind }): JSX.Element {
  const meta = NODE_META[kind];
  const Icon = meta.icon;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, kind);
        e.dataTransfer.effectAllowed = 'move';
      }}
      title={meta.description}
      className="flex cursor-grab items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm hover:bg-surface-2 active:cursor-grabbing"
    >
      <span className={`flex h-6 w-6 items-center justify-center rounded ${meta.accent}`}>
        <Icon size={14} />
      </span>
      <span className="truncate">{meta.label}</span>
    </div>
  );
}
