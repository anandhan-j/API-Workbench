import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui-store';

export function TabBar(): JSX.Element {
  const tabs = useUiStore((s) => s.tabs);
  const activeTabId = useUiStore((s) => s.activeTabId);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const closeTab = useUiStore((s) => s.closeTab);
  const navigate = useNavigate();
  const location = useLocation();

  // Keep the active tab in sync with the current route.
  useEffect(() => {
    const match = tabs.find((t) => t.path === location.pathname);
    if (match && match.id !== activeTabId) setActiveTab(match.id);
  }, [location.pathname, tabs, activeTabId, setActiveTab]);

  return (
    <div className="flex h-10 items-stretch gap-1 border-b border-border bg-bg px-2">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            'group flex cursor-pointer items-center gap-2 rounded-t-md border-b-2 border-transparent px-3 text-sm',
            tab.id === activeTabId
              ? 'border-accent bg-surface text-fg'
              : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
          onClick={() => {
            setActiveTab(tab.id);
            navigate(tab.path);
          }}
          role="tab"
          aria-selected={tab.id === activeTabId}
        >
          <span className="truncate">{tab.title}</span>
          {tab.closable && (
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              className="rounded p-0.5 opacity-0 hover:bg-border group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
