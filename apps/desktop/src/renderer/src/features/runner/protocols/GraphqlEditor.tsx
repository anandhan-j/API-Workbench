import type { GraphqlPayload } from '@shared/protocol';
import { VariableField } from '../../variables/VariableField';
import { Labeled, INPUT_CLASS } from './fields';
import { RecordEditor } from './RecordEditor';
import type { ProtocolEditorProps } from './types';

/** Editor for the GraphQL payload: endpoint, query, variables JSON, headers. */
export function GraphqlEditor({
  value,
  onChange,
  suggestions,
  variableContext,
}: ProtocolEditorProps): JSX.Element {
  const payload = value as unknown as GraphqlPayload;
  const patch = (p: Partial<GraphqlPayload>): void => onChange({ ...value, ...p });

  return (
    <div className="space-y-3">
      <Labeled label="Endpoint">
        <VariableField
          value={payload.url ?? ''}
          onChange={(url) => patch({ url })}
          suggestions={suggestions}
          {...(variableContext ? { variableContext } : {})}
          placeholder="{{baseUrl}}/graphql"
          aria-label="GraphQL endpoint"
          className={INPUT_CLASS}
        />
      </Labeled>

      <Labeled label="Query">
        <VariableField
          value={payload.query ?? ''}
          onChange={(query) => patch({ query })}
          suggestions={suggestions}
          {...(variableContext ? { variableContext } : {})}
          multiline
          rows={10}
          placeholder={'query ($id: ID!) {\n  user(id: $id) { id name }\n}'}
          aria-label="GraphQL query"
          className={`${INPUT_CLASS} resize-y`}
        />
      </Labeled>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Labeled label="Variables" hint="JSON">
          <VariableField
            value={payload.variables ?? ''}
            onChange={(variables) => patch({ variables })}
            suggestions={suggestions}
            {...(variableContext ? { variableContext } : {})}
            multiline
            rows={5}
            placeholder={'{\n  "id": "{{userId}}"\n}'}
            aria-label="GraphQL variables"
            className={`${INPUT_CLASS} resize-y`}
          />
        </Labeled>
        <Labeled label="Operation name" hint="optional">
          <VariableField
            value={payload.operationName ?? ''}
            onChange={(operationName) => patch({ operationName })}
            suggestions={suggestions}
            {...(variableContext ? { variableContext } : {})}
            placeholder="GetUser"
            aria-label="GraphQL operation name"
            className={INPUT_CLASS}
          />
        </Labeled>
      </div>

      <Labeled label="Headers">
        <RecordEditor
          value={payload.headers ?? {}}
          onChange={(headers) => patch({ headers })}
          keyPlaceholder="Header"
          suggestions={suggestions}
        />
      </Labeled>
    </div>
  );
}
