import {
  GRAPHQL_REQUEST_TYPE,
  GRPC_REQUEST_TYPE,
  HTTP_REQUEST_TYPE,
  SSE_REQUEST_TYPE,
  WEBSOCKET_REQUEST_TYPE,
  type GrpcPayload as GrpcPayloadType,
} from '@shared/protocol';
import { qualifiedContributionId, type PluginContributionIndex } from '@shared/plugins';
import { defaultProtocolPayload, type RequestDraft } from './build-request';
import { GraphqlEditor } from './protocols/GraphqlEditor';
import { GrpcEditor } from './protocols/GrpcEditor';
import { WebSocketEditor } from './protocols/WebSocketEditor';
import { SseEditor } from './protocols/SseEditor';
import type { ProtocolEditorProps } from './protocols/types';

/**
 * Presentation + payload metadata for each built-in request type (ADR-0009).
 * One table lets the runner's type picker, address bar, save path, and the
 * workflow node bridge all agree on a protocol's label, badge, default
 * payload, and display target — mirroring the workflow `node-meta` pattern.
 */
export interface RequestTypeMeta {
  type: string;
  label: string;
  /** Short chip shown in the address bar and stored in the `method` column. */
  badge: string;
  /** Tailwind classes for the badge chip. */
  badgeColor: string;
  /** A freshly-created request's payload (the `pluginPayload` bag). */
  defaultPayload: () => Record<string, unknown>;
  /** The display target (stored in the `url` column; shown in the address bar). */
  targetOf: (payload: Record<string, unknown>) => string;
  /** The dedicated payload editor. */
  Editor: (props: ProtocolEditorProps) => JSX.Element;
}

export const BUILTIN_REQUEST_TYPE_META: Record<string, RequestTypeMeta> = {
  [GRAPHQL_REQUEST_TYPE]: {
    type: GRAPHQL_REQUEST_TYPE,
    label: 'GraphQL',
    badge: 'GQL',
    badgeColor: 'text-pink-400',
    defaultPayload: () => defaultProtocolPayload(GRAPHQL_REQUEST_TYPE),
    targetOf: (payload) => String((payload as { url?: string }).url ?? ''),
    Editor: GraphqlEditor,
  },
  [GRPC_REQUEST_TYPE]: {
    type: GRPC_REQUEST_TYPE,
    label: 'gRPC',
    badge: 'gRPC',
    badgeColor: 'text-cyan-400',
    defaultPayload: () => defaultProtocolPayload(GRPC_REQUEST_TYPE),
    targetOf: (payload) => {
      const p = payload as Partial<GrpcPayloadType>;
      if (!p.target && !p.service) return '';
      return `${p.target ?? ''}/${p.service ?? ''}.${p.method ?? ''}`;
    },
    Editor: GrpcEditor,
  },
  [WEBSOCKET_REQUEST_TYPE]: {
    type: WEBSOCKET_REQUEST_TYPE,
    label: 'WebSocket',
    badge: 'WS',
    badgeColor: 'text-violet-400',
    defaultPayload: () => defaultProtocolPayload(WEBSOCKET_REQUEST_TYPE),
    targetOf: (payload) => String((payload as { url?: string }).url ?? ''),
    Editor: WebSocketEditor,
  },
  [SSE_REQUEST_TYPE]: {
    type: SSE_REQUEST_TYPE,
    label: 'SSE',
    badge: 'SSE',
    badgeColor: 'text-amber-400',
    defaultPayload: () => defaultProtocolPayload(SSE_REQUEST_TYPE),
    targetOf: (payload) => String((payload as { url?: string }).url ?? ''),
    Editor: SseEditor,
  },
};

/** Built-in non-HTTP request types, in picker display order. */
export const BUILTIN_PROTOCOL_TYPES = [
  GRAPHQL_REQUEST_TYPE,
  GRPC_REQUEST_TYPE,
  WEBSOCKET_REQUEST_TYPE,
  SSE_REQUEST_TYPE,
];

/** Whether `type` is one of the built-in non-HTTP protocols. */
export function isBuiltinProtocol(type: string | undefined): boolean {
  return Boolean(type && type !== HTTP_REQUEST_TYPE && type in BUILTIN_REQUEST_TYPE_META);
}

/** Meta for a built-in protocol type, or undefined for HTTP/plugin types. */
export function getRequestTypeMeta(type: string | undefined): RequestTypeMeta | undefined {
  return type ? BUILTIN_REQUEST_TYPE_META[type] : undefined;
}

/**
 * The identity a draft persists to the `type`/`method`/`url` columns. HTTP uses
 * its real method/URL; non-HTTP types store the provider's badge and display
 * target so the tree and history render the right chip (ADR-0009).
 */
export function persistedIdentity(
  draft: RequestDraft,
  pluginTypes: PluginContributionIndex['requestTypes'],
): { type: string; method: string; url: string } {
  const type = draft.requestType ?? HTTP_REQUEST_TYPE;
  if (type === HTTP_REQUEST_TYPE) return { type, method: draft.method, url: draft.url };
  const payload = draft.pluginPayload ?? {};
  const meta = getRequestTypeMeta(type);
  if (meta) return { type, method: meta.badge, url: meta.targetOf(payload) };
  const contribution = pluginTypes.find(
    (rt) => qualifiedContributionId(rt.pluginId, rt.type) === type,
  );
  return {
    type,
    method: contribution?.summary.badge ?? 'PLUGIN',
    url: contribution ? String((payload as Record<string, unknown>)[contribution.summary.targetKey] ?? '') : '',
  };
}
