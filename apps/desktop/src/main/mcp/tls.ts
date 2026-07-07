/**
 * Generates an ephemeral self-signed certificate for the app-managed MCP server
 * when HTTPS is enabled. Kept in the app (not the published package) so the
 * package stays free of certificate-generation dependencies. The PEM material is
 * handed to the child over env vars, so the private key never touches disk.
 */

export interface McpTlsMaterial {
  cert: string;
  key: string;
}

// selfsigned ships declaration types that are declared-but-not-exported, so the
// module is untyped in practice; load it via require with a local shape.
interface SelfsignedResult {
  private: string;
  cert: string;
}
interface SelfsignedModule {
  generate: (attrs?: unknown[], opts?: Record<string, unknown>) => SelfsignedResult;
}
// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS-only dep with unusable shipped types
const selfsigned = require('selfsigned') as SelfsignedModule;

export function generateSelfSignedCert(): McpTlsMaterial {
  const result = selfsigned.generate([{ name: 'commonName', value: '127.0.0.1' }], {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 7, ip: '127.0.0.1' },
          { type: 2, value: 'localhost' },
        ],
      },
    ],
  });
  return { cert: result.cert, key: result.private };
}
