import * as grpc from '@grpc/grpc-js';
import { loadUnaryMethod } from './proto-loader';

/** What a unary gRPC call needs to dial and encode/decode one message. */
export interface GrpcUnaryRequest {
  target: string;
  protoFile: string;
  importDirs: string[];
  service: string;
  method: string;
  /** Parsed request message (JSON object). */
  message: object;
  metadata: Record<string, string>;
  useTls: boolean;
  deadlineMs: number;
  tls?: { certPem: string; keyPem: string };
  signal?: AbortSignal;
}

/** The outcome of a unary call: response message plus status and both maps. */
export interface GrpcUnaryResult {
  message: unknown;
  statusCode: number;
  statusName: string;
  metadata: Record<string, string>;
  trailers: Record<string, string>;
}

/**
 * Port over a gRPC unary call. Isolating the `@grpc/grpc-js` import here keeps
 * it out of the provider (and therefore out of tests), which use a fake.
 */
export interface GrpcInvoker {
  invokeUnary(request: GrpcUnaryRequest): Promise<GrpcUnaryResult>;
}

function metadataToRecord(metadata: grpc.Metadata | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!metadata) return out;
  const map = metadata.getMap();
  for (const [key, value] of Object.entries(map)) {
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

/** The production invoker over `@grpc/grpc-js`. */
export function createGrpcInvoker(): GrpcInvoker {
  return {
    invokeUnary(request) {
      return new Promise<GrpcUnaryResult>((resolve, reject) => {
        let method;
        try {
          method = loadUnaryMethod(request.protoFile, request.importDirs, request.service, request.method);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }

        const credentials =
          request.useTls || request.tls
            ? request.tls
              ? grpc.credentials.createSsl(
                  undefined,
                  Buffer.from(request.tls.keyPem),
                  Buffer.from(request.tls.certPem),
                )
              : grpc.credentials.createSsl()
            : grpc.credentials.createInsecure();

        const client = new grpc.Client(request.target, credentials);

        const metadata = new grpc.Metadata();
        for (const [key, value] of Object.entries(request.metadata)) {
          metadata.set(key.toLowerCase(), value);
        }

        const deadline = new Date(Date.now() + request.deadlineMs);
        const responseMetadata: Record<string, string> = {};
        const responseTrailers: Record<string, string> = {};

        const call = client.makeUnaryRequest(
          method.path,
          (value) => method.serialize(value as object),
          (bytes) => method.deserialize(bytes),
          request.message,
          metadata,
          { deadline },
          (error, value) => {
            client.close();
            if (error) {
              const grpcError = error as grpc.ServiceError;
              resolve({
                message: null,
                statusCode: grpcError.code ?? grpc.status.UNKNOWN,
                statusName: grpc.status[grpcError.code ?? grpc.status.UNKNOWN] ?? 'UNKNOWN',
                metadata: responseMetadata,
                trailers: { ...responseTrailers, ...metadataToRecord(grpcError.metadata) },
              });
              return;
            }
            resolve({
              message: value ?? null,
              statusCode: grpc.status.OK,
              statusName: 'OK',
              metadata: responseMetadata,
              trailers: responseTrailers,
            });
          },
        );

        // Leading (response) metadata and trailing (status) metadata arrive on
        // separate events; capture both so trailers surface even on success.
        call.on('metadata', (md) => Object.assign(responseMetadata, metadataToRecord(md)));
        call.on('status', (status: grpc.StatusObject) =>
          Object.assign(responseTrailers, metadataToRecord(status.metadata)),
        );

        if (request.signal) {
          if (request.signal.aborted) {
            call.cancel();
          } else {
            request.signal.addEventListener('abort', () => call.cancel(), { once: true });
          }
        }
      });
    },
  };
}
