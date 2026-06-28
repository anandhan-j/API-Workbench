// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuthConfig, ApplyContext } from '@shared/auth';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { NodeEncryptor } from '../../variables/node-encryptor';
import { AuthService } from '../auth-service';
import { applyAuth } from '../applier';
import { signSigV4 } from '../aws-sigv4';
import { buildDigestHeader, parseChallenge } from '../digest';
import { refreshOAuth2, isOAuth2Expired } from '../token-manager';

const ctx = (over: Partial<ApplyContext> = {}): ApplyContext => ({
  method: 'GET',
  url: 'https://api.example.com/v1/things?z=1&a=2',
  ...over,
});

describe('applyAuth', () => {
  it('bearer / basic / apiKey / cookie / oauth2 / clientCert', () => {
    expect(applyAuth({ type: 'bearer', token: 'abc' }, ctx()).headers['Authorization']).toBe(
      'Bearer abc',
    );
    expect(applyAuth({ type: 'basic', username: 'u', password: 'p' }, ctx()).headers['Authorization']).toBe(
      'Basic ' + Buffer.from('u:p').toString('base64'),
    );

    const apiHeader = applyAuth({ type: 'apiKey', key: 'X-Key', value: 'k', in: 'header' }, ctx());
    expect(apiHeader.headers['X-Key']).toBe('k');
    const apiQuery = applyAuth({ type: 'apiKey', key: 'api_key', value: 'k', in: 'query' }, ctx());
    expect(apiQuery.query['api_key']).toBe('k');

    const cookie = applyAuth(
      { type: 'cookie', cookies: [{ name: 'sid', value: '42' }] },
      ctx(),
    );
    expect(cookie.cookies['sid']).toBe('42');

    expect(
      applyAuth({ type: 'oauth2', accessToken: 'tok', headerPrefix: 'Bearer' }, ctx()).headers[
        'Authorization'
      ],
    ).toBe('Bearer tok');

    const cert = applyAuth(
      { type: 'clientCert', certPem: 'CERT', keyPem: 'KEY', passphrase: 'pp' },
      ctx(),
    );
    expect(cert.tls).toEqual({ certPem: 'CERT', keyPem: 'KEY', passphrase: 'pp' });
  });

  it('throws for digest without a challenge, signs with one', () => {
    expect(() => applyAuth({ type: 'digest', username: 'u', password: 'p', algorithm: 'MD5' }, ctx())).toThrow();
    const challenge = 'Digest realm="test", nonce="abc123", qop="auth", opaque="xyz"';
    const out = applyAuth(
      { type: 'digest', username: 'u', password: 'p', algorithm: 'MD5' },
      ctx({ digestChallenge: challenge }),
    );
    expect(out.headers['Authorization']).toMatch(/^Digest /);
    expect(out.headers['Authorization']).toContain('response=');
  });
});

describe('AWS SigV4', () => {
  it('matches the published get-vanilla test vector', () => {
    // aws-sig-v4-test-suite "get-vanilla"
    const { headers } = signSigV4({
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'service',
      method: 'GET',
      url: 'https://example.amazonaws.com/',
      now: Date.parse('2015-08-30T12:36:00Z'),
    });
    expect(headers['x-amz-date']).toBe('20150830T123600Z');
    expect(headers['Authorization']).toContain(
      'Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request',
    );
    expect(headers['Authorization']).toContain('SignedHeaders=host;x-amz-date');
    expect(headers['Authorization']).toContain(
      'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('includes the session token header when provided', () => {
    const { headers } = signSigV4({
      accessKeyId: 'AKID',
      secretAccessKey: 'secret',
      region: 'us-east-1',
      service: 's3',
      sessionToken: 'TOKEN',
      method: 'GET',
      url: 'https://example.amazonaws.com/',
      now: Date.parse('2015-08-30T12:36:00Z'),
    });
    expect(headers['x-amz-security-token']).toBe('TOKEN');
    expect(headers['Authorization']).toContain('x-amz-security-token');
  });
});

describe('digest', () => {
  it('parses a challenge and builds a deterministic response', () => {
    const challenge = parseChallenge('Digest realm="r", nonce="n", qop="auth", opaque="o"');
    expect(challenge).toMatchObject({ realm: 'r', nonce: 'n', qop: 'auth', opaque: 'o' });
    const a = buildDigestHeader({ username: 'u', password: 'p', method: 'GET', uri: '/x', challenge, cnonce: 'cn', nc: '00000001' });
    const b = buildDigestHeader({ username: 'u', password: 'p', method: 'GET', uri: '/x', challenge, cnonce: 'cn', nc: '00000001' });
    expect(a).toBe(b);
    expect(a).toContain('qop=auth');
    expect(a).toContain('nc=00000001');
    expect(a).toContain('cnonce="cn"');
  });
});

describe('OAuth2 token refresh', () => {
  const base = { type: 'oauth2' as const, accessToken: 'old', refreshToken: 'r', tokenUrl: 'https://id/token', headerPrefix: 'Bearer' };

  it('detects expiry with skew', () => {
    expect(isOAuth2Expired({ ...base, expiresAt: 1000 }, 2000)).toBe(true);
    expect(isOAuth2Expired({ ...base, expiresAt: 10_000_000 }, 1000)).toBe(false);
    expect(isOAuth2Expired({ ...base, accessToken: '' }, 1000)).toBe(true);
  });

  it('refreshes via the injected fetcher', async () => {
    const next = await refreshOAuth2(base, async () => ({ accessToken: 'new', refreshToken: 'r2', expiresIn: 3600 }), 1000);
    expect(next.accessToken).toBe('new');
    expect(next.refreshToken).toBe('r2');
    expect(next.expiresAt).toBe(1000 + 3600 * 1000);
  });

  it('is a no-op without a token URL or refresh token', async () => {
    const next = await refreshOAuth2({ ...base, refreshToken: undefined }, async () => ({ accessToken: 'x' }));
    expect(next.accessToken).toBe('old');
  });
});

describe('AuthService', () => {
  let dir: string;
  let service: PersistenceService;
  let auth: AuthService;

  beforeEach(async () => {
    const conn = await createSqlJsConnection();
    dir = mkdtempSync(join(tmpdir(), 'awb-auth-'));
    service = new PersistenceService(conn, { backupDir: dir, appVersion: '0.1.0' });
    auth = new AuthService(service, new NodeEncryptor());
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('stores credentials with secrets encrypted at rest', () => {
    const meta = auth.save({ scope: 'workspace', scopeId: 'w1', name: 'Prod', config: { type: 'bearer', token: 'super-secret' } });
    expect(meta.type).toBe('bearer');

    // The raw stored row must be encrypted and must not contain the plaintext token.
    const row = service.authConfigs.get(meta.id)!;
    expect(row.encrypted).toBe(true);
    expect(row.config).not.toContain('super-secret');

    // list exposes metadata only (no secret material).
    const list = auth.list('workspace', 'w1');
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('super-secret');

    // getConfig round-trips the decrypted secret.
    expect(auth.getConfig(meta.id)).toEqual({ type: 'bearer', token: 'super-secret' });
  });

  it('applies a stored credential with variable substitution', () => {
    const meta = auth.save({ scope: 'workspace', scopeId: 'w1', name: 'Tpl', config: { type: 'bearer', token: '{{token}}' } });
    const artifacts = auth.apply(meta.id, ctx(), (t) => t.replace('{{token}}', 'resolved'));
    expect(artifacts.headers['Authorization']).toBe('Bearer resolved');
  });

  it('is reusable across requests (same credential, many applies)', () => {
    const meta = auth.save({ scope: 'collection', scopeId: 'c1', name: 'Key', config: { type: 'apiKey', key: 'X-Key', value: 'k', in: 'header' } as AuthConfig });
    expect(auth.apply(meta.id, ctx()).headers['X-Key']).toBe('k');
    expect(auth.apply(meta.id, ctx({ url: 'https://other.example.com/' })).headers['X-Key']).toBe('k');
  });

  it('updating a credential by name overwrites in place', () => {
    auth.save({ scope: 'workspace', scopeId: 'w1', name: 'Prod', config: { type: 'bearer', token: 'a' } });
    auth.save({ scope: 'workspace', scopeId: 'w1', name: 'Prod', config: { type: 'bearer', token: 'b' } });
    expect(auth.list('workspace', 'w1')).toHaveLength(1);
  });

  it('refreshes a stored OAuth2 credential and persists the new token', async () => {
    const meta = auth.save({
      scope: 'workspace',
      scopeId: 'w1',
      name: 'OAuth',
      config: { type: 'oauth2', accessToken: 'old', refreshToken: 'r', tokenUrl: 'https://id/token', headerPrefix: 'Bearer' },
    });
    await auth.refresh(meta.id, async () => ({ accessToken: 'fresh', expiresIn: 60 }));
    const config = auth.getConfig(meta.id);
    expect(config.type === 'oauth2' && config.accessToken).toBe('fresh');
  });
});
