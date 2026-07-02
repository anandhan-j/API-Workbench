import { NavLink } from 'react-router-dom';
import { Activity, Boxes, Braces, FolderKanban, House, PanelLeftClose, PanelLeft, Puzzle, Send, Settings, Workflow } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui-store';

interface NavItem {
  to: string;
  label: string;
  icon: typeof House;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/workspaces', label: 'Workspaces', icon: FolderKanban },
  { to: '/collections', label: 'Collections', icon: Boxes },
  { to: '/variables', label: 'Variables', icon: Braces },
  { to: '/runner', label: 'Run', icon: Send },
  { to: '/workflows', label: 'Workflows', icon: Workflow },
  { to: '/dispatch', label: 'Dispatch Monitor', icon: Activity },
  { to: '/plugins', label: 'Plugins', icon: Puzzle },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar(): JSX.Element {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface transition-all duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div className="flex h-12 items-center gap-2 border-b border-border px-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
          <Activity size={16} />
        </div>
        {!collapsed && <span className="truncate text-sm font-semibold">API Workbench</span>}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg',
                isActive && 'bg-surface-2 text-fg',
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="flex items-center gap-3 border-t border-border px-4 py-3 text-sm text-muted hover:text-fg"
      >
        {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
