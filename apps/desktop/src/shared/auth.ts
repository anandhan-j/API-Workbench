import { z } from 'zod';

/**
 * Transport DTOs for the Authentication Framework (Phase 9).
 *
 * `AuthConfig` is a discriminated union over the supported schemes. Stored
 * credentials persist the config with secret material encrypted at rest; the
 * applier turns a (variable-resolved) config into concrete HTTP artifacts
 * (headers / query params / cookies / TLS material) for the execution engine.
 */

export const AuthType = z.enum([
  'none',
  'bearer',
  'basic',
  'apiKey',
  'oauth2',
  'digest',
  'awsSigv4',
  'cookie',
  'clientCert',
]);
export type AuthType = z.infer<typeof AuthType>;

export const ApiKeyLocation = z.enum(['header', 'query']);
export type ApiKeyLocation = z.infer<typeof ApiKeyLocation>;

export const AuthConfig = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string() }),
  z.object({ type: z.literal('basic'), username: z.string(), password: z.string() }),
  z.object({
    type: z.literal('apiKey'),
    key: z.string(),
    value: z.string(),
    in: ApiKeyLocation.default('header'),
  }),
  z.object({
    type: z.literal('oauth2'),
    accessToken: z.string().default(''),
    refreshToken: z.string().optional(),
    tokenUrl: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    scope: z.string().optional(),
    /** Epoch ms when the access token expires; used to decide refresh. */
    expiresAt: z.number().optional(),
    headerPrefix: z.string().default('Bearer'),
  }),
  z.object({
    type: z.literal('digest'),
    username: z.string(),
    password: z.string(),
    algorithm: z.enum(['MD5', 'MD5-sess']).default('MD5'),
  }),
  z.object({
    type: z.literal('awsSigv4'),
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    region: z.string(),
    service: z.string(),
    sessionToken: z.string().optional(),
  }),
  z.object({
    type: z.literal('cookie'),
    cookies: z.array(z.object({ name: z.string(), value: z.string() })),
  }),
  z.object({
    type: z.literal('clientCert'),
    certPem: z.string(),
    keyPem: z.string(),
    passphrase: z.string().optional(),
  }),
]);
export type AuthConfig = z.infer<typeof AuthConfig>;

/** Concrete material the execution engine applies to an outgoing request. */
export const AuthArtifacts = z.object({
  headers: z.record(z.string()),
  query: z.record(z.string()),
  cookies: z.record(z.string()),
  tls: z
    .object({ certPem: z.string(), keyPem: z.string(), passphrase: z.string().optional() })
    .optional(),
});
export type AuthArtifacts = z.infer<typeof AuthArtifacts>;

/** Stored, reusable named credential metadata (never includes secret material). */
export const CredentialMeta = z.object({
  id: z.string(),
  scope: z.string(),
  scopeId: z.string(),
  name: z.string(),
  type: AuthType,
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type CredentialMeta = z.infer<typeof CredentialMeta>;

export const SaveCredentialInput = z.object({
  scope: z.string(),
  scopeId: z.string().optional(),
  name: z.string().min(1),
  config: AuthConfig,
});
export type SaveCredentialInput = z.infer<typeof SaveCredentialInput>;

/** Context the applier needs (notably for SigV4 signing and digest). */
export const ApplyContext = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  now: z.number().optional(),
  /** A WWW-Authenticate digest challenge captured from a prior 401, if any. */
  digestChallenge: z.string().optional(),
});
export type ApplyContext = z.infer<typeof ApplyContext>;
