import { Box, Boxes, type LucideIcon } from 'lucide-react';
import type { WorkflowNodeKind } from '@shared/workflow';
import { qualifiedContributionId } from '@shared/plugins';
import { pluginIconFor } from '../../components/plugin-icon';
import { usePluginContributions } from '../plugins/use-plugins';
import { NODE_META, PALETTE_KINDS, type PluginNodeContribution } from './node-meta';

/**
 * The draggable node palette. Dragging a chip onto the canvas adds a node of
 * that kind (handled by the canvas's onDrop). The kind travels via the native
 * drag dataTransfer under a private MIME type. The enclosing section provides
 * the "Nodes" header and collapse control; this renders the scrollable list.
 *
 * Below the draggable nodes it offers grouping actions that operate on the
 * canvas's current selection (wired through the page to the canvas), so a user
 * can group/ungroup without reaching for the canvas toolbar or shortcuts.
 */
export const DND_MIME = 'application/x-workbench-node';

interface NodePaletteProps {
  /** Group the canvas's currently-selected nodes. */
  onGroup?: () => void;
  /** Ungroup the selected group (or a member's group). */
  onUngroup?: () => void;
  /** Whether the current selection can be grouped (2+ ungrouped nodes). */
  canGroup?: boolean;
  /** Whether the current selection can be ungrouped. */
  canUngroup?: boolean;
}

export function NodePalette({
  onGroup,
  onUngroup,
  canGroup = false,
  canUngroup = false,
}: NodePaletteProps = {}): JSX.Element {
  const showGrouping = Boolean(onGroup || onUngroup);
  const contributions = usePluginContributions();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
      <div className="flex flex-col gap-1.5">
        {PALETTE_KINDS.map((kind) => (
          <PaletteItem key={kind} kind={kind} />
        ))}
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted">Drag onto the canvas, then connect.</p>

      {contributions.nodes.length > 0 && (
        <>
          <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Plugins
          </p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {contributions.nodes.map((node) => (
              <PluginPaletteItem
                key={qualifiedContributionId(node.pluginId, node.kind)}
                node={node}
              />
            ))}
          </div>
        </>
      )}

      {showGrouping && (
        <>
          <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Group
          </p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            <ActionItem
              icon={Boxes}
              label="Group selection"
              accent="bg-slate-500/15 text-slate-300"
              disabled={!canGroup}
              onClick={onGroup}
            />
            <ActionItem
              icon={Box}
              label="Ungroup"
              accent="bg-slate-500/15 text-slate-300"
              disabled={!canUngroup}
              onClick={onUngroup}
            />
          </div>
          <p className="mt-1 px-1 text-[11px] text-muted">
            Select 2+ nodes on the canvas, then group.
          </p>
        </>
      )}
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

/** A plugin-contributed node chip; drags its fully-qualified kind. */
function PluginPaletteItem({ node }: { node: PluginNodeContribution }): JSX.Element {
  const qualified = qualifiedContributionId(node.pluginId, node.kind);
  const Icon = pluginIconFor(node.icon);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, qualified);
        e.dataTransfer.effectAllowed = 'move';
      }}
      title={node.description ?? `From ${node.pluginName}`}
      className="flex cursor-grab items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm hover:bg-surface-2 active:cursor-grabbing"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-500/15 text-slate-300">
        <Icon size={14} />
      </span>
      <span className="truncate">{node.label}</span>
    </div>
  );
}

function ActionItem({
  icon: Icon,
  label,
  accent,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  accent: string;
  disabled?: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className={`flex h-6 w-6 items-center justify-center rounded ${accent}`}>
        <Icon size={14} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
