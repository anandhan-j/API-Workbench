import { FolderOpen } from 'lucide-react';
import type { GrpcPayload } from '@shared/protocol';
import { invoke } from '../../../lib/ipc';
import { VariableField } from '../../variables/VariableField';
import { Labeled, INPUT_CLASS, parseIntField } from './fields';
import { RecordEditor } from './RecordEditor';
import type { ProtocolEditorProps } from './types';

/** Editor for a gRPC unary call: target, proto, service/method, message, metadata. */
export function GrpcEditor({
  value,
  onChange,
  suggestions,
  variableContext,
}: ProtocolEditorProps): JSX.Element {
  const payload = value as unknown as GrpcPayload;
  const patch = (p: Partial<GrpcPayload>): void => onChange({ ...value, ...p });

  const browseProto = async (): Promise<void> => {
    const result = await invoke('dialog.openPath', {
      filters: [{ name: 'Protocol Buffers', extensions: ['proto'] }],
    });
    if (!result.canceled && result.path) patch({ protoFile: result.path });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Labeled label="Target" hint="host:port">
          <VariableField
            value={payload.target ?? ''}
            onChange={(target) => patch({ target })}
            suggestions={suggestions}
            {...(variableContext ? { variableContext } : {})}
            placeholder="localhost:50051"
            aria-label="gRPC target"
            className={INPUT_CLASS}
          />
        </Labeled>
        <Labeled label="Deadline" hint="ms">
          <input
            type="number"
            value={payload.deadlineMs ?? 30000}
            onChange={(e) => patch({ deadlineMs: parseIntField(e.target.value, payload.deadlineMs ?? 30000) })}
            aria-label="gRPC deadline"
            className={INPUT_CLASS}
          />
        </Labeled>
      </div>

      <Labeled label="Proto file" hint="absolute path">
        <div className="flex gap-2">
          <input
            value={payload.protoFile ?? ''}
            onChange={(e) => patch({ protoFile: e.target.value })}
            placeholder="C:\\protos\\service.proto"
            aria-label="Proto file path"
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={() => void browseProto()}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-surface-2"
          >
            <FolderOpen size={14} /> Browse
          </button>
        </div>
      </Labeled>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Labeled label="Service" hint="pkg.Service">
          <input
            value={payload.service ?? ''}
            onChange={(e) => patch({ service: e.target.value })}
            placeholder="greeter.Greeter"
            aria-label="gRPC service"
            className={INPUT_CLASS}
          />
        </Labeled>
        <Labeled label="Method">
          <input
            value={payload.method ?? ''}
            onChange={(e) => patch({ method: e.target.value })}
            placeholder="SayHello"
            aria-label="gRPC method"
            className={INPUT_CLASS}
          />
        </Labeled>
      </div>

      <Labeled label="Message" hint="JSON">
        <VariableField
          value={payload.message ?? '{}'}
          onChange={(message) => patch({ message })}
          suggestions={suggestions}
          {...(variableContext ? { variableContext } : {})}
          multiline
          rows={8}
          placeholder={'{\n  "name": "{{name}}"\n}'}
          aria-label="gRPC request message"
          className={`${INPUT_CLASS} resize-y`}
        />
      </Labeled>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={payload.useTls ?? false}
          onChange={(e) => patch({ useTls: e.target.checked })}
        />
        Use TLS
      </label>

      <Labeled label="Metadata">
        <RecordEditor
          value={payload.metadata ?? {}}
          onChange={(metadata) => patch({ metadata })}
          keyPlaceholder="Key"
          suggestions={suggestions}
        />
      </Labeled>
    </div>
  );
}
