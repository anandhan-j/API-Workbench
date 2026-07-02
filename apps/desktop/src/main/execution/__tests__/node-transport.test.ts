// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { FetchTransport } from '../node-transport';

/**
 * Drives the production transport against a real HTTPS server presenting a
 * throwaway self-signed certificate (valid for 127.0.0.1, so hostname matches —
 * the only reason verification fails is the untrusted issuer). This proves the
 * "verify SSL certificates" toggle actually reaches the TLS stack.
 */

const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDBLcsGj8n41nJv
ImAsrjHGX4g5SoqKP7oMN2wnoiG4QJXaoOiSk0ZTZOc5kW6ZigfPvrPQeEksbRo7
SpqlBRQJ72mSHs1OB+C+arkiMjP2PxtMXscvQOFStEenwt4C5naMGpN0yUFVWkDA
Vz13BQ3Lh6VDEMiwspdYZqLpiIeduOUV+0qXkmopu+/1uYOc08rjKPI52LUk61Ar
PSzKT1d1URCfkGNj1Dx0bHHeI8Y1gpgYJ5nYrg21Oc3Wsj2ZfLmxT0dqF98SIc4b
lkjFrmPJRUhRhfIqkgOBqC16Shcc+EXGmyh3JISFRm/gL7s3Kgsoj2uh5ga1alTo
VVl6tsPRAgMBAAECggEAAI39RWgNSDx0Df33G7m7pS+qCEwT/hX1FqA5ccWv5hkI
CnLS0so/IJyAuMls8V4+69RG147jhY/3TCXzMA0bLnTJr083qgUwxSsw8ThcA4Am
jRS/6qf7iE1sipPvJ5VPetMqtYz3CzkxSBFtY5WX9rZ4KCtOADU1ul2/vamUMMTm
r/B8MoojPqs3/XO0jRhSInE7MBMTcICPMZdXLDHzZWvZ0FPr3E5Ca5BAzdTQ6iZ8
bwAAPqlM7ncx5wTSWpjoEnRxvVSICyN/KJ1YhM2uPZ3aVAg+T7Jt7uaVk5hBQYCA
l+4waLmKr6FVx2HuyeDp/8vJKFckqhwMfmbZKFEVjwKBgQDsoH1jHS2i/S3sFzYu
UvPoGJEpgtEfeVoqCV6RzD/3hLrH/rw+/1HdiadJg3iGy9TqtXXhWa5+WV+IKitj
uqDQ5gPw923sYFf7bHFgLI4dOFVIcBSplawqtQ33oQD6DRyi1dvJR2JTfKVCLV+2
Sm/46U8ay7RiskODgEtoOpwdYwKBgQDQ/qrXWGD9Z1UclFO2J88/Zo1nQBS3k4h+
Igy66mRIFBPPTRCnmS22dNn42UInplsGvmPW4u7hiJO0t48v6zPiaC66wEwE1G0h
qw6Bc3DwOUj11VPK0RzFE40W/nmdR4OHJEnoQqVJ+AxT8yXzfrRXksLCfkJp2Omu
jeTm0ntqOwKBgDglBFtGCxQHOqQwBb0MFa9WVOsijPgI1SnwOy4g5nSWW7MkcAoK
jqQgCz9YIHrrVkOydpvXqZ11G0O1rcHmAE5QpVLBgqV5XqbbXjNRnw6z1Rhw75Yl
W0pu1zeQTikGf2rrj1C8zUm944BGP9WC5/qJcSmMd+qLHZXQFRRQA8a9AoGAQI0I
E29Wta3+2c7udCqjln+EWUmvnGvTErJNoEXZJ3IcFEFHTZzAQ8Sftn7UMg7tuo1/
pNV+1uYqSP0RGsnYwqtPE5tlX3CFLIr69fzD+06WPGfhc5lW+3/oahu7UFrQQyNw
OG6tQsV8eUl2hVizNwE7ans45Bx9QM7OzoRgXhUCgYBLgeE28cYE56qTlQTQ/oaN
EVIZJGkyZ9clSGDa/556w2yj8UMPAt9wdifzM8EGa9MJtF0GOXOUQebSqO5uQ06q
LbWeGCZ5tEnKxvPsFvDQhaY/pd/zVsvpOreOpxdwuUUf4QZpoRhm7TrZGnnThtEg
ddFQ2M4fDzUa+NkNrHRfXw==
-----END PRIVATE KEY-----`;

const CERT = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUfxwZJmZR5rUGqF0MuOeoRJRp5Y8wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDcwMjE5MDYyOVoXDTM2MDYy
OTE5MDYyOVowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAwS3LBo/J+NZybyJgLK4xxl+IOUqKij+6DDdsJ6IhuECV
2qDokpNGU2TnOZFumYoHz76z0HhJLG0aO0qapQUUCe9pkh7NTgfgvmq5IjIz9j8b
TF7HL0DhUrRHp8LeAuZ2jBqTdMlBVVpAwFc9dwUNy4elQxDIsLKXWGai6YiHnbjl
FftKl5JqKbvv9bmDnNPK4yjyOdi1JOtQKz0syk9XdVEQn5BjY9Q8dGxx3iPGNYKY
GCeZ2K4NtTnN1rI9mXy5sU9HahffEiHOG5ZIxa5jyUVIUYXyKpIDgagtekoXHPhF
xpsodySEhUZv4C+7NyoLKI9roeYGtWpU6FVZerbD0QIDAQABo28wbTAdBgNVHQ4E
FgQUcbgjt/+Cyq7eJrAVx80S2XZ3yhUwHwYDVR0jBBgwFoAUcbgjt/+Cyq7eJrAV
x80S2XZ3yhUwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBABlF+dGqCNriIoIUMaVLjU3/rqFlqZkT
Aj2GrMsNQMNLRNzIKS7Tji2nOtDzM6vjajVc88AJYIA6LersxfsHBGMF6wlqE7zq
T8LpbGCn7mpVGRwZJ9On8Uyl1TkFcBe3lPUPn1QWNMP5g71qO1Jxw05DrH+JMKVA
FOO5/hHOaRF38DRMKk0SwsNeaUSy2HZNEuJLxUWiN/pQYpIn1Ck0M1OkOYe0g9vV
PYUhxG7W2bxfiOmWynuDv/H0oN+cbJpiVENudjko/qep1esYXxLCj/JqLMdn1MCi
dLsJbGrhym/Q0mju5K8Zd6I/IhulkRZVtPJ57fBIwNc+FCEouv9zfDk=
-----END CERTIFICATE-----`;

describe('FetchTransport TLS verification', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = createServer({ key: KEY, cert: CERT }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('secure-ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    url = `https://127.0.0.1:${port}/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('rejects a self-signed certificate when verification is on', async () => {
    const transport = new FetchTransport(() => true);
    await expect(transport.send({ method: 'GET', url, headers: {} })).rejects.toThrow();
  });

  it('accepts a self-signed certificate when verification is off', async () => {
    const transport = new FetchTransport(() => false);
    const res = await transport.send({ method: 'GET', url, headers: {} });
    expect(res.status).toBe(200);
    expect(res.body.toString('utf8')).toBe('secure-ok');
  });

  it('verifies certificates by default (no flag supplied)', async () => {
    const transport = new FetchTransport();
    await expect(transport.send({ method: 'GET', url, headers: {} })).rejects.toThrow();
  });
});
