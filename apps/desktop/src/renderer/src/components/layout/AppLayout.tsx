import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { StatusBar } from './StatusBar';
import { DispatchMonitor } from '../../features/dispatch-monitor/DispatchMonitor';
import { useDispatchStream } from '../../features/dispatch-monitor/use-dispatch-stream';
import { AssistantPanel } from '../../features/assistant/AssistantPanel';
import { useAiDataSync } from '../../features/assistant/use-ai-data-sync';
import { useUiStore } from '../../stores/ui-store';

/** Application chrome: sidebar, tab bar, routed content, dispatch monitor, assistant dock, status bar. */
export function AppLayout(): JSX.Element {
  const monitorOpen = useUiStore((s) => s.monitorOpen);
  const assistantOpen = useUiStore((s) => s.assistantOpen);
  useDispatchStream();
  // Refresh collections/workflows/variables views when the AI edits them.
  useAiDataSync();

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
      {assistantOpen && <AssistantPanel />}
    </div>
  );
}
