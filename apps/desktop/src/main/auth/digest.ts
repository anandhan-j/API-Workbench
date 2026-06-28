import { createHash, randomBytes } from 'node:crypto';

/**
 * HTTP Digest authentication (RFC 2617 / 7616, MD5 & MD5-sess).
 *
 * `parseChallenge` reads a `WWW-Authenticate: Digest …` header captured from a
 * prior 401; `buildDigestHeader` computes the `Authorization` value for the
 * follow-up request.
 */

export interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

export function parseChallenge(header: string): DigestChallenge {
  const stripped = header.replace(/^\s*Digest\s+/i, '');
  const result: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([^,]*))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripped)) !== null) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return {
    realm: result['realm'] ?? '',
    nonce: result['nonce'] ?? '',
    ...(result['qop'] ? { qop: result['qop'] } : {}),
    ...(result['opaque'] ? { opaque: result['opaque'] } : {}),
    ...(result['algorithm'] ? { algorithm: result['algorithm'] } : {}),
  };
}

export interface DigestInput {
  username: string;
  password: string;
  method: string;
  uri: string;
  challenge: DigestChallenge;
  /** Client nonce; generated if omitted (injectable for tests). */
  cnonce?: string;
  /** Nonce count, hex 8 digits; defaults to 00000001. */
  nc?: string;
}

export function buildDigestHeader(input: DigestInput): string {
  const { username, password, method, uri, challenge } = input;
  const algorithm = challenge.algorithm ?? 'MD5';
  const cnonce = input.cnonce ?? randomBytes(8).toString('hex');
  const nc = input.nc ?? '00000001';
  const qop = challenge.qop ? challenge.qop.split(',')[0].trim() : undefined;

  let ha1 = md5(`${username}:${challenge.realm}:${password}`);
  if (algorithm.toLowerCase() === 'md5-sess') {
    ha1 = md5(`${ha1}:${challenge.nonce}:${cnonce}`);
  }
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);

  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${algorithm}`,
    `response="${response}"`,
  ];
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  return `Digest ${parts.join(', ')}`;
}
