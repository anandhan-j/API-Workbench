import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 signing (pure node:crypto).
 *
 * Produces the `Authorization`, `x-amz-date` (and optional security-token)
 * headers for a request, following the documented SigV4 algorithm so it can be
 * unit-tested against AWS's published example vectors.
 */

export interface SigV4Input {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  sessionToken?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** Epoch ms; defaults to now. */
  now?: number;
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** RFC 3986 encoding (AWS-style); does not encode unreserved characters. */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodePath(path: string): string {
  if (path === '' || path === '/') return '/';
  return path
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
}

function amzDates(now: number): { amzDate: string; dateStamp: string } {
  const iso = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, '');
  // iso is like 20240101T120000Z
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function canonicalQuery(search: string): string {
  if (!search) return '';
  const params = new URLSearchParams(search);
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of params) pairs.push([encodeRfc3986(k), encodeRfc3986(v)]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

export interface SigV4Output {
  headers: Record<string, string>;
}

export function signSigV4(input: SigV4Input): SigV4Output {
  const now = input.now ?? Date.now();
  const { amzDate, dateStamp } = amzDates(now);
  const url = new URL(input.url);
  const host = url.host;
  const body = input.body ?? '';
  const payloadHash = sha256Hex(body);

  // Canonical headers — host, x-amz-date, and (if present) the security token.
  const headerMap: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
  };
  if (input.sessionToken) headerMap['x-amz-security-token'] = input.sessionToken;

  const sortedHeaderNames = Object.keys(headerMap).sort();
  const canonicalHeaders = sortedHeaderNames.map((n) => `${n}:${headerMap[n].trim()}\n`).join('');
  const signedHeaders = sortedHeaderNames.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    encodePath(url.pathname),
    canonicalQuery(url.search.replace(/^\?/, '')),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    'x-amz-date': amzDate,
    Authorization: authorization,
  };
  if (input.sessionToken) headers['x-amz-security-token'] = input.sessionToken;
  return { headers };
}
