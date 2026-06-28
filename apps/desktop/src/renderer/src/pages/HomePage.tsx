import { useQuery } from '@tanstack/react-query';
import { Boxes, GitBranch, Send, Workflow } from 'lucide-react';
import { invoke, isBridgeAvailable } from '../lib/ipc';

const CAPABILITIES = [
  { icon: Boxes, title: 'Collections', desc: 'Import OpenAPI specs and organize requests.' },
  { icon: Send, title: 'Execution', desc: 'Run REST requests with rich diagnostics.' },
  { icon: Workflow, title: 'Workflows', desc: 'Compose drag-and-drop API automations.' },
  { icon: GitBranch, title: 'Versioning', desc: 'Snapshot, diff, and roll back collections.' },
];

export function HomePage(): JSX.Element {
  const { data: info } = useQuery({
    queryKey: ['app.getInfo'],
    queryFn: () => invoke('app.getInfo', {}),
    enabled: isBridgeAvailable(),
  });

  return (
    <div className="w-full p-8">
      <h1 className="text-2xl font-semibold">Welcome to API Workbench</h1>
      <p className="mt-2 text-muted">
        The application shell is running{info ? ` — ${info.name} v${info.version}` : ''}. This is
        the Phase 1 foundation: layout, theming, logging, and the dispatch monitor.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-accent">
                <Icon size={18} />
              </div>
              <h2 className="font-medium">{title}</h2>
            </div>
            <p className="mt-2 text-sm text-muted">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
