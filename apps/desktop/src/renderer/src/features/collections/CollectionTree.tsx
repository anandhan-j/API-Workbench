import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import { ChevronRight, FileText, Folder as FolderIcon, Star } from 'lucide-react';
import type { TreeNode } from '@shared/collection';
import { cn } from '../../lib/cn';

const ROW_HEIGHT = 30;

const METHOD_COLOR: Record<string, string> = {
  GET: 'text-success',
  POST: 'text-warning',
  PUT: 'text-accent',
  PATCH: 'text-accent',
  DELETE: 'text-danger',
  HEAD: 'text-muted',
  OPTIONS: 'text-muted',
};

export interface CollectionTreeProps {
  nodes: TreeNode[];
  selectedId?: string | null;
  height?: number;
  onOpen?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
}

/**
 * Virtualized collection tree. Renders the flat, depth-annotated node list from
 * the explorer service with `react-window`, so only the visible rows are mounted
 * — this is what keeps the explorer responsive with tens of thousands of nodes.
 */
export function CollectionTree({
  nodes,
  selectedId,
  height = 480,
  onOpen,
  onToggleFavorite,
}: CollectionTreeProps): JSX.Element {
  if (nodes.length === 0) {
    return <p className="p-3 text-sm text-muted">This collection is empty.</p>;
  }

  const Row = ({ index, style }: ListChildComponentProps): JSX.Element => {
    const node = nodes[index];
    const indent = 8 + node.depth * 16;

    if (node.type === 'folder') {
      return (
        <div
          style={style}
          className="flex items-center gap-1.5 text-sm text-fg"
          data-testid="tree-folder"
        >
          <span style={{ paddingLeft: indent }} className="flex items-center gap-1.5">
            <ChevronRight size={14} className="text-muted" />
            <FolderIcon size={15} className="text-accent" />
            <span className="truncate">{node.name}</span>
          </span>
        </div>
      );
    }

    return (
      <div
        style={style}
        className={cn(
          'group flex items-center justify-between text-sm hover:bg-surface-2',
          node.id === selectedId && 'bg-surface-2',
        )}
        data-testid="tree-request"
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          style={{ paddingLeft: indent }}
          onClick={() => onOpen?.(node.id)}
        >
          <FileText size={15} className="shrink-0 text-muted" />
          <span className={cn('w-12 shrink-0 text-[11px] font-semibold', METHOD_COLOR[node.method])}>
            {node.method}
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        <button
          type="button"
          aria-label={node.favorite ? `Unfavorite ${node.name}` : `Favorite ${node.name}`}
          className="px-2"
          onClick={() => onToggleFavorite?.(node.id)}
        >
          <Star
            size={14}
            className={cn(
              node.favorite ? 'fill-warning text-warning' : 'text-muted opacity-0 group-hover:opacity-100',
            )}
          />
        </button>
      </div>
    );
  };

  return (
    <FixedSizeList height={height} width="100%" itemCount={nodes.length} itemSize={ROW_HEIGHT}>
      {Row}
    </FixedSizeList>
  );
}
