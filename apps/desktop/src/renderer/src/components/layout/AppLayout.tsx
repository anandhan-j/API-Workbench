import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { StatusBar } from './StatusBar';
import { DispatchMonitor } from '../../features/dispatch-monitor/DispatchMonitor';
import { useDispatchStream } from '../../features/dispatch-monitor/use-dispatch-stream';
import { useUiStore } from '../../stores/ui-store';

/** Application chrome: sidebar, tab bar, routed content, dispatch monitor, status bar. */
export function AppLayout(): JSX.Element {
  const monitorOpen = useUiStore((s) => s.monitorOpen);
  useDispatchStream();

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-fg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
        {monitorOpen && <DispatchMonitor />}
        <StatusBar />
      </div>
    </div>
  );
}
