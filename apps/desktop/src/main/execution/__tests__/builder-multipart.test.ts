// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExecutionRequest } from '@shared/execution';
import type { AuthArtifacts } from '@shared/auth';
import { buildPreparedRequest } from '../builder';

const noArtifacts: AuthArtifacts = { headers: {}, query: {}, cookies: {} };
const identity = (s: string): string => s;

function req(body: ExecutionRequest['body']): ExecutionRequest {
  return { method: 'POST', url: 'https://api.test/upload', headers: {}, query: {}, body };
}

describe('buildPreparedRequest — multipart with files', () => {
  it('emits a text part and a binary file part', () => {
    const out = buildPreparedRequest(
      req({
        type: 'multipart',
        fields: [
          { name: 'title', value: 'hello' },
          { name: 'avatar', fileName: 'a.txt', base64: Buffer.from('hi').toString('base64') },
        ],
      }),
      identity,
      noArtifacts,
    );

    const ct = out.prepared.headers['Content-Type'] ?? '';
    expect(ct).toMatch(/^multipart\/form-data; boundary=----awb/);
    const text = out.prepared.body!.toString('utf8');
    expect(text).toContain('Content-Disposition: form-data; name="title"');
    expect(text).toContain('hello');
    expect(text).toContain('Content-Disposition: form-data; name="avatar"; filename="a.txt"');
    expect(text).toContain('Content-Type: application/octet-stream');
    expect(text).toContain('hi'); // decoded file bytes
  });

  it('preserves raw bytes of a file part (not utf8 re-encoded)', () => {
    const bytes = Buffer.from([0xff, 0x00, 0x10, 0x80]);
    const out = buildPreparedRequest(
      req({
        type: 'multipart',
        fields: [{ name: 'f', fileName: 'b.bin', base64: bytes.toString('base64') }],
      }),
      identity,
      noArtifacts,
    );
    // The exact 4 bytes must appear contiguously in the payload.
    expect(out.prepared.body!.includes(bytes)).toBe(true);
  });
});
