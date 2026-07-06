import type { ExecutionRequest } from '@shared/execution';
import { HTTP_REQUEST_TYPE, HttpPayload, toProtocolResponse } from '@shared/protocol';
import type { MainRequestTypeProvider } from '../../plugins/registries/request-type-registry';
import type { HttpTransport } from '../transport';
import { ExecutionEngine } from '../executor';
import { buildPreparedRequest } from '../builder';

/**
 * The built-in HTTP request-type provider (Phase 16, ADR-0009).
 *
 * Carries the pre-envelope execution pipeline verbatim: variables are resolved
 * field-by-field during request build (not by generic deep substitution), auth
 * artifacts are merged by the builder, and the {@link ExecutionEngine} keeps
 * ownership of retry/timeout/redirect/classification. Only the outer shape
 * changed: payload in, {@link toProtocolResponse}-mapped envelope response out.
 */
export function createHttpProvider(transport: HttpTransport): MainRequestTypeProvider {
  const engine = new ExecutionEngine(transport);
  return {
    type: HTTP_REQUEST_TYPE,
    payloadSchema: HttpPayload,
    resolveVariables: (payload) => payload,
    buildApplyContext: (payload, evaluate) => {
      const p = payload as HttpPayload;
      return { method: p.method, url: evaluate(p.url) };
    },
    summarize: (payload) => {
      const p = payload as HttpPayload;
      return { badge: p.method, target: p.url };
    },
    async execute(payload, ctx) {
      const request = payload as ExecutionRequest;
      const { prepared } = buildPreparedRequest(request, ctx.evaluate, ctx.artifacts);
      const response = await engine.execute(prepared, ctx.options, ctx.signal);
      return toProtocolResponse(response);
    },
  };
}
