import type { ExecutionRequest, RequestBody } from '@shared/execution';
import type { AuthArtifacts } from '@shared/auth';
import type { PreparedRequest } from './executor';

type Evaluate = (template: string) => string;

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());
}

function buildBody(body: RequestBody, ev: Evaluate): { buffer?: Buffer; contentType?: string } {
  switch (body.type) {
    case 'none':
      return {};
    case 'text':
      return { buffer: Buffer.from(ev(body.content), 'utf8'), contentType: body.contentType ?? 'text/plain' };
    case 'json':
      return { buffer: Buffer.from(ev(body.content), 'utf8'), contentType: 'application/json' };
    case 'form': {
      const encoded = body.fields
        .map((f) => `${encodeURIComponent(ev(f.name))}=${encodeURIComponent(ev(f.value))}`)
        .join('&');
      return { buffer: Buffer.from(encoded, 'utf8'), contentType: 'application/x-www-form-urlencoded' };
    }
    case 'multipart': {
      const boundary = `----awb${Math.random().toString(16).slice(2)}`;
      const chunks: Buffer[] = [];
      for (const f of body.fields) {
        const name = ev(f.name);
        if (f.base64 !== undefined) {
          const fileName = f.fileName ?? 'file';
          chunks.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${fileName}"\r\n` +
                `Content-Type: application/octet-stream\r\n\r\n`,
              'utf8',
            ),
          );
          chunks.push(Buffer.from(f.base64, 'base64'));
          chunks.push(Buffer.from('\r\n', 'utf8'));
        } else {
          chunks.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${ev(f.value ?? '')}\r\n`,
              'utf8',
            ),
          );
        }
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
      return { buffer: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
    }
    case 'binary':
      return { buffer: Buffer.from(body.base64, 'base64'), contentType: body.contentType ?? 'application/octet-stream' };
    default:
      return {};
  }
}

export interface BuildOutput {
  prepared: PreparedRequest;
  tls?: AuthArtifacts['tls'];
}

/**
 * Builds the final HTTP request from an {@link ExecutionRequest}: substitutes
 * variables in url/headers/query/body, merges auth artifacts (headers, query,
 * cookies), and sets the content-type from the body when absent.
 */
export function buildPreparedRequest(
  request: ExecutionRequest,
  evaluate: Evaluate,
  artifacts: AuthArtifacts,
): BuildOutput {
  const url = new URL(evaluate(request.url));
  for (const [k, v] of Object.entries(request.query)) url.searchParams.set(evaluate(k), evaluate(v));
  for (const [k, v] of Object.entries(artifacts.query)) url.searchParams.set(k, v);

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers)) headers[k] = evaluate(v);
  Object.assign(headers, artifacts.headers);

  const cookiePairs = Object.entries(artifacts.cookies).map(([n, v]) => `${n}=${v}`);
  if (cookiePairs.length > 0) {
    headers['Cookie'] = [headers['Cookie'], ...cookiePairs].filter(Boolean).join('; ');
  }

  const { buffer, contentType } = buildBody(request.body, evaluate);
  if (buffer && contentType && !hasHeader(headers, 'content-type')) {
    headers['Content-Type'] = contentType;
  }

  return {
    prepared: {
      method: request.method,
      url: url.toString(),
      headers,
      ...(buffer ? { body: buffer } : {}),
    },
    ...(artifacts.tls ? { tls: artifacts.tls } : {}),
  };
}
