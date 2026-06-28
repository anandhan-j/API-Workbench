import { isBridgeAvailable } from '../../lib/ipc';
import { RequestEditor } from './RequestEditor';

export function RequestRunnerPage(): JSX.Element {
  if (!isBridgeAvailable()) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Run</h1>
        <p className="mt-2 text-muted">Request execution requires the desktop runtime.</p>
      </div>
    );
  }
  return (
    <div className="h-full w-full p-6">
      <RequestEditor />
    </div>
  );
}
