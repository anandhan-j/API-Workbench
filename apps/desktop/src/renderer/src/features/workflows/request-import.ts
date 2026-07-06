import type { RequestDetailFull } from '@shared/request-details';
import { HTTP_REQUEST_TYPE } from '@shared/protocol';
import type { ExtractRule, RequestNodeConfig } from '@shared/workflow';
import { buildRequestEnvelope, detailToDraft } from '../runner/build-request';

/**
 * Maps a collection request's full definition into a workflow request-node config
 * (Phase: link workflows to collections). It reuses the runner's exact
 * draft → RequestEnvelope conversion so a node imported from a collection
 * behaves identically to running that request in the runner: same method, URL,
 * headers, query params, body, auth, and options.
 *
 * `extract` rules already on the node are preserved (importing replaces the
 * request definition, not the response mappings), and the node records its
 * source `requestId` for display and re-sync.
 */
export function requestDetailToNodeConfig(
  detail: RequestDetailFull,
  extract: ExtractRule[] = [],
): RequestNodeConfig {
  const envelope = buildRequestEnvelope(detailToDraft(detail));
  return {
    type: HTTP_REQUEST_TYPE,
    payload: envelope.payload,
    ...(envelope.auth ? { auth: envelope.auth } : {}),
    ...(envelope.options ? { options: envelope.options } : {}),
    extract,
    requestId: detail.id,
  };
}
