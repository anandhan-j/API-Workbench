import type { VariableContext } from '@shared/execution';
import type { ApplyContext, AuthArtifacts, AuthConfig, WireAuthConfig } from '@shared/auth';
import { RequestEnvelope, type ProtocolResponse } from '@shared/protocol';
import type { HttpTransport } from './transport';
import { createHttpProvider } from './providers/http-provider';
import { RequestTypeRegistry } from '../plugins/registries/request-type-registry';
import { applyAuth } from '../auth/applier';

/** An auth source at the envelope level: inline config and/or stored credential. */
export interface EnvelopeAuthSource {
  auth?: WireAuthConfig;
  credentialId?: string;
}

export interface ExecutionServiceDeps {
  /** Resolves `{{variables}}` in request fields, given the request's scope context. */
  evaluate?: (template: string, context?: VariableContext) => string;
  /**
   * Resolves an auth source to artifacts (AuthService.resolveArtifacts in prod,
   * where stored credentials and plugin providers live). The default handles
   * inline built-in configs only, keeping the service usable standalone.
   */
  resolveArtifacts?: (
    source: EnvelopeAuthSource,
    ctx: ApplyContext,
    evaluate: (template: string) => string,
  ) => Promise<AuthArtifacts>;
  /** Request-type providers; defaults to the built-in HTTP provider alone. */
  requestTypes?: RequestTypeRegistry;
}

const EMPTY_ARTIFACTS: AuthArtifacts = { headers: {}, query: {}, cookies: {} };

function substituteAuth(config: AuthConfig, evaluate: (t: string) => string): AuthConfig {
  const walk = (v: unknown): unknown =>
    typeof v === 'string'
      ? evaluate(v)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)]))
          : v;
  return walk(config) as AuthConfig;
}

/**
 * The protocol-agnostic execution dispatcher (Phase 16, ADR-0009).
 *
 * Accepts a {@link RequestEnvelope} (legacy flat HTTP requests are lifted by
 * the envelope schema), resolves the request-type provider, validates the
 * payload against the provider's schema, resolves variables and auth
 * artifacts, and hands off to the provider. Stored-credential decryption and
 * plugin auth dispatch live behind the injected `resolveArtifacts` port.
 */
export class ExecutionService {
  private readonly registry: RequestTypeRegistry;

  constructor(
    transport: HttpTransport,
    private readonly deps: ExecutionServiceDeps = {},
  ) {
    this.registry =
      deps.requestTypes ?? new RequestTypeRegistry([createHttpProvider(transport)]);
  }

  async run(request: unknown, signal?: AbortSignal): Promise<ProtocolResponse> {
    const envelope = RequestEnvelope.parse(request);
    const provider = this.registry.resolve(envelope.type);
    const ctx = envelope.variableContext;
    const evaluate = (template: string): string =>
      this.deps.evaluate ? this.deps.evaluate(template, ctx) : template;

    const payload = provider.resolveVariables(
      provider.payloadSchema.parse(envelope.payload ?? {}),
      evaluate,
    );

    let artifacts = EMPTY_ARTIFACTS;
    if (envelope.auth || envelope.credentialId) {
      const applyCtx = provider.buildApplyContext(payload, evaluate);
      artifacts = this.deps.resolveArtifacts
        ? await this.deps.resolveArtifacts(
            { ...(envelope.auth ? { auth: envelope.auth } : {}),
              ...(envelope.credentialId ? { credentialId: envelope.credentialId } : {}) },
            applyCtx,
            evaluate,
          )
        : envelope.auth
          ? // Standalone fallback (no resolveArtifacts port): built-in schemes only.
            // Plugin auth needs the injected port, which prod always supplies.
            applyAuth(substituteAuth(envelope.auth as AuthConfig, evaluate), applyCtx)
          : EMPTY_ARTIFACTS;
    }

    return provider.execute(payload, {
      artifacts,
      ...(envelope.options ? { options: envelope.options } : {}),
      ...(signal ? { signal } : {}),
      evaluate,
    });
  }
}
