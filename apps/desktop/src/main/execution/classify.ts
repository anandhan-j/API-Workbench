import type { BodyKind } from '@shared/execution';

/** Classifies a response body by content-type and produces a pretty form for JSON. */
export function classifyBody(
  contentType: string,
  body: Buffer,
): { bodyKind: BodyKind; text: string; prettyBody?: string } {
  const ct = contentType.toLowerCase();
  if (body.length === 0) return { bodyKind: 'empty', text: '' };

  const isJson = ct.includes('application/json') || ct.includes('+json');
  const isXml = ct.includes('xml');
  const isHtml = ct.includes('html');
  const isText = ct.startsWith('text/') || isJson || isXml || isHtml || ct.includes('javascript');

  if (!isText) {
    return { bodyKind: 'binary', text: body.toString('base64') };
  }

  const text = body.toString('utf8');
  if (isJson) {
    try {
      return { bodyKind: 'json', text, prettyBody: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
      return { bodyKind: 'json', text };
    }
  }
  if (isXml) return { bodyKind: 'xml', text };
  if (isHtml) return { bodyKind: 'html', text };
  return { bodyKind: 'text', text };
}
