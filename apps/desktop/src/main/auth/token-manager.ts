import type { AuthConfig } from '@shared/auth';

/** Token endpoint response (normalized). */
export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // seconds
}

/** Injectable token-endpoint caller (real HTTP arrives with the execution engine). */
export type TokenFetcher = (input: {
  tokenUrl: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  scope?: string;
}) => Promise<TokenResponse>;

type OAuth2Config = Extract<AuthConfig, { type: 'oauth2' }>;

/** True if the access token is missing or within `skewMs` of expiry. */
export function isOAuth2Expired(config: OAuth2Config, now = Date.now(), skewMs = 30_000): boolean {
  if (!config.accessToken) return true;
  if (config.expiresAt === undefined) return false;
  return now >= config.expiresAt - skewMs;
}

/**
 * Refreshes an OAuth2 access token using the injected fetcher, returning an
 * updated config. If the config lacks a token URL or refresh token it is
 * returned unchanged.
 */
export async function refreshOAuth2(
  config: OAuth2Config,
  fetcher: TokenFetcher,
  now = Date.now(),
): Promise<OAuth2Config> {
  if (!config.tokenUrl || !config.refreshToken) return config;
  const res = await fetcher({
    tokenUrl: config.tokenUrl,
    ...(config.clientId ? { clientId: config.clientId } : {}),
    ...(config.clientSecret ? { clientSecret: config.clientSecret } : {}),
    refreshToken: config.refreshToken,
    ...(config.scope ? { scope: config.scope } : {}),
  });
  return {
    ...config,
    accessToken: res.accessToken,
    refreshToken: res.refreshToken ?? config.refreshToken,
    ...(res.expiresIn !== undefined ? { expiresAt: now + res.expiresIn * 1000 } : {}),
  };
}
