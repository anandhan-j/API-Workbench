import {
  GRPC_REQUEST_TYPE,
  GrpcPayload,
  type GrpcProtocolExtras,
  type ProtocolResponse,
} from '@shared/protocol';
import { deepSubstitute } from '@shared/substitute';
import type { MainRequestTypeProvider } from '../../plugins/registries/request-type-registry';
import type { GrpcInvoker } from '../grpc/grpc-client';

/**
 * The built-in gRPC unary request-type provider (ADR-0009).
 *
 * The `.proto` is loaded from disk (so `import` statements resolve), the JSON
 * request message is encoded via the generated codec, and one unary call is
 * dialed. Auth `headers` map to gRPC metadata (lowercased); `tls` artifacts
 * become channel credentials; `query`/`cookies` don't apply and are ignored.
 * `summary.code` is the numeric gRPC status so status assertions keep working.
 */
export function createGrpcProvider(invoker: GrpcInvoker): MainRequestTypeProvider {
  return {
    type: GRPC_REQUEST_TYPE,
    payloadSchema: GrpcPayload,
    resolveVariables: (payload, evaluate) => deepSubstitute(payload, evaluate),
    buildApplyContext: (payload) => {
      const p = payload as GrpcPayload;
      return { url: `grpc://${p.target}/${p.service}/${p.method}` };
    },
    summarize: (payload) => {
      const p = payload as GrpcPayload;
      return { badge: 'gRPC', target: `${p.target}/${p.service}.${p.method}` };
    },
    async execute(payload, ctx): Promise<ProtocolResponse> {
      const p = payload as GrpcPayload;
      const startedAt = Date.now();

      let message: object;
      try {
        const parsed = p.message.trim() ? JSON.parse(p.message) : {};
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('message must be a JSON object');
        }
        message = parsed as object;
      } catch (err) {
        throw new Error(
          `gRPC request message is not a valid JSON object: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Auth headers → metadata; tls artifact → channel credentials.
      const metadata: Record<string, string> = { ...p.metadata };
      for (const [key, value] of Object.entries(ctx.artifacts.headers)) {
        metadata[key.toLowerCase()] = value;
      }

      try {
        const result = await invoker.invokeUnary({
          target: p.target,
          protoFile: p.protoFile,
          importDirs: p.importDirs,
          service: p.service,
          method: p.method,
          message,
          metadata,
          useTls: p.useTls,
          deadlineMs: ctx.options?.timeoutMs ?? p.deadlineMs,
          ...(ctx.artifacts.tls
            ? { tls: { certPem: ctx.artifacts.tls.certPem, keyPem: ctx.artifacts.tls.keyPem } }
            : {}),
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        });

        const ok = result.statusCode === 0;
        // gRPC surfaces a client cancel as status CANCELLED (1) via the normal
        // callback (not a throw), so classify it here instead of as an error.
        const cancelled = (ctx.signal?.aborted ?? false) || result.statusCode === 1;
        const body = JSON.stringify(result.message ?? null, null, 2);
        const extras: GrpcProtocolExtras = {
          statusCode: result.statusCode,
          statusName: result.statusName,
          metadata: result.metadata,
          trailers: result.trailers,
        };
        return {
          type: GRPC_REQUEST_TYPE,
          ok,
          summary: {
            label: cancelled ? 'Cancelled' : `${result.statusCode} ${result.statusName}`,
            tone: ok ? 'success' : cancelled ? 'info' : 'error',
            code: String(result.statusCode),
          },
          metadata: { ...result.metadata, ...result.trailers },
          body,
          bodyKind: 'json',
          prettyBody: body,
          contentType: 'application/grpc+json',
          sizeBytes: Buffer.byteLength(body, 'utf8'),
          timings: { startedAt, totalMs: Date.now() - startedAt },
          ...(ok ? {} : { error: `gRPC ${result.statusName}` }),
          ...(cancelled ? { cancelled: true } : {}),
          protocol: extras,
        };
      } catch (err) {
        const cancelled = ctx.signal?.aborted ?? false;
        const messageText = err instanceof Error ? err.message : String(err);
        return {
          type: GRPC_REQUEST_TYPE,
          ok: false,
          summary: {
            label: cancelled ? 'Cancelled' : 'Error',
            tone: cancelled ? 'info' : 'error',
          },
          metadata: {},
          body: '',
          bodyKind: 'empty',
          contentType: '',
          sizeBytes: 0,
          timings: { startedAt, totalMs: Date.now() - startedAt },
          error: messageText,
          ...(cancelled ? { cancelled: true } : {}),
        };
      }
    },
  };
}
