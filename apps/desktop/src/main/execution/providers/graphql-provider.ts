import type { ExecutionRequest } from '@shared/execution';
import {
  GRAPHQL_REQUEST_TYPE,
  GraphqlPayload,
  toProtocolResponse,
  type GraphqlProtocolExtras,
  type ProtocolResponse,
} from '@shared/protocol';
import { deepSubstitute } from '@shared/substitute';
import type { MainRequestTypeProvider } from '../../plugins/registries/request-type-registry';
import type { HttpTransport } from '../transport';
import { ExecutionEngine } from '../executor';
import { buildPreparedRequest } from '../builder';

interface GraphqlErrorShape {
  message: string;
  path?: (string | number)[];
}

/** Lifts the operation's top-level `errors` out of a response body, if any. */
function parseGraphqlErrors(body: string): GraphqlErrorShape[] {
  try {
    const parsed = JSON.parse(body) as { errors?: unknown };
    if (!Array.isArray(parsed.errors)) return [];
    return parsed.errors.map((e) => {
      const record = (e ?? {}) as Record<string, unknown>;
      return {
        message: typeof record.message === 'string' ? record.message : JSON.stringify(e),
        ...(Array.isArray(record.path) ? { path: record.path as (string | number)[] } : {}),
      };
    });
  } catch {
    return [];
  }
}

/**
 * The built-in GraphQL request-type provider (a POST of
 * `{query, variables, operationName}` over the HTTP engine).
 *
 * Unlike HTTP, variables are deep-substituted up front so the operation
 * `variables` JSON can be parsed and re-serialized — variable values can never
 * break the wire body. A transport-level 200 with a non-empty top-level
 * `errors` array is a failed operation: `ok` is false and the errors ride in
 * the extras (which remain a superset of HTTP's, so status assertions work).
 */
export function createGraphqlProvider(transport: HttpTransport): MainRequestTypeProvider {
  const engine = new ExecutionEngine(transport);
  return {
    type: GRAPHQL_REQUEST_TYPE,
    payloadSchema: GraphqlPayload,
    resolveVariables: (payload, evaluate) => deepSubstitute(payload, evaluate),
    buildApplyContext: (payload) => {
      const p = payload as GraphqlPayload;
      return { method: 'POST', url: p.url };
    },
    summarize: (payload) => {
      const p = payload as GraphqlPayload;
      return { badge: 'GQL', target: p.url };
    },
    async execute(payload, ctx): Promise<ProtocolResponse> {
      const p = payload as GraphqlPayload;
      const variablesText = p.variables.trim();
      let variables: unknown;
      if (variablesText) {
        try {
          variables = JSON.parse(variablesText);
        } catch (err) {
          throw new Error(
            `GraphQL variables are not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      const request: ExecutionRequest = {
        method: 'POST',
        url: p.url,
        headers: p.headers,
        query: {},
        body: {
          type: 'json',
          content: JSON.stringify({
            query: p.query,
            ...(variables !== undefined ? { variables } : {}),
            ...(p.operationName ? { operationName: p.operationName } : {}),
          }),
        },
      };
      // Payload fields were substituted in resolveVariables; identity here
      // keeps the builder from evaluating resolved values a second time.
      const { prepared } = buildPreparedRequest(request, (t) => t, ctx.artifacts);
      const response = await engine.execute(prepared, ctx.options, ctx.signal);

      const base = toProtocolResponse(response);
      const graphqlErrors = response.error ? [] : parseGraphqlErrors(response.body);
      const ok = base.ok && graphqlErrors.length === 0;
      const extras: GraphqlProtocolExtras = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        redirects: response.redirects,
        retries: response.retries,
        graphqlErrors,
      };
      return {
        ...base,
        type: GRAPHQL_REQUEST_TYPE,
        ok,
        summary: {
          ...base.summary,
          ...(graphqlErrors.length > 0 && base.ok
            ? {
                label: `${base.summary.label} · ${graphqlErrors.length} GraphQL error${graphqlErrors.length === 1 ? '' : 's'}`,
                tone: 'error' as const,
              }
            : {}),
        },
        protocol: extras,
      };
    },
  };
}
