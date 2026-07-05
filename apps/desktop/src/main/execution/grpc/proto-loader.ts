import * as protoLoader from '@grpc/proto-loader';

/**
 * A resolved unary method: the fully-qualified path the wire uses plus the
 * serializer/deserializer pair proto-loader generated from the `.proto`.
 */
export interface UnaryMethod {
  /** `/pkg.Service/Method` — the HTTP/2 path gRPC dials. */
  path: string;
  serialize: (message: object) => Buffer;
  deserialize: (bytes: Buffer) => object;
}

interface LoadedMethod {
  path: string;
  requestSerialize: (value: object) => Buffer;
  responseDeserialize: (bytes: Buffer) => object;
}

/** Walks the loaded package tree to the `service` name (e.g. `pkg.Greeter`). */
function resolveService(pkg: protoLoader.PackageDefinition, service: string): Record<string, unknown> {
  const def = (pkg as Record<string, unknown>)[service];
  if (!def || typeof def !== 'object') {
    const services = Object.keys(pkg).filter((k) => {
      const entry = (pkg as Record<string, unknown>)[k];
      return entry && typeof entry === 'object' && Object.values(entry as object).some(isMethodDef);
    });
    throw new Error(
      `Service "${service}" not found in proto. Available services: ${services.join(', ') || '(none)'}`,
    );
  }
  return def as Record<string, unknown>;
}

function isMethodDef(value: unknown): value is LoadedMethod {
  return Boolean(value) && typeof value === 'object' && 'path' in (value as object);
}

/**
 * Loads a `.proto` from disk and resolves one unary method's wire path and
 * codecs. `importDirs` are extra include roots for `import` statements;
 * proto-loader resolves imports relative to on-disk files, which is why the
 * UI takes a file path rather than pasted content.
 */
export function loadUnaryMethod(
  protoFile: string,
  importDirs: string[],
  service: string,
  method: string,
): UnaryMethod {
  if (!protoFile.trim()) throw new Error('A .proto file path is required for gRPC requests');
  const pkg = protoLoader.loadSync(protoFile, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: importDirs.length > 0 ? importDirs : undefined,
  });
  const serviceDef = resolveService(pkg, service);
  const methodDef = serviceDef[method];
  if (!isMethodDef(methodDef)) {
    const methods = Object.keys(serviceDef).filter((k) => isMethodDef(serviceDef[k]));
    throw new Error(
      `Method "${method}" not found in service "${service}". Available methods: ${methods.join(', ') || '(none)'}`,
    );
  }
  return {
    path: methodDef.path,
    serialize: methodDef.requestSerialize,
    deserialize: methodDef.responseDeserialize,
  };
}
