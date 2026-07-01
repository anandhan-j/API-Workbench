import type { RawType } from './build-request';

export type FormatResult = { ok: true; value: string } | { ok: false; error: string };

/** Pretty-print a JSON string with 2-space indent; reports the parse error on failure. */
export function formatJson(input: string): FormatResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.stringify(JSON.parse(trimmed), null, 2) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}

/**
 * Best-effort XML pretty-printer: breaks between adjacent tags and indents by
 * nesting depth. Text content, self-closing tags, declarations and comments are
 * left on their own line. Not a validating parser — attributes containing `>`
 * are not handled, but it is safe for the common request-body shapes.
 */
export function formatXml(input: string): FormatResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: input };

  const lines = trimmed.replace(/>\s*</g, '>\n<').split('\n');
  const out: string[] = [];
  let depth = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^<\/[^>]+>/.test(line)) depth = Math.max(0, depth - 1);
    out.push('  '.repeat(depth) + line);
    const isOpening = /^<[^!?/][^>]*>$/.test(line); // <tag ...> but not <?, <!, </
    const isSelfClosing = /\/>$/.test(line);
    const isInline = /^<([\w:.-]+)[^>]*>.*<\/\1>$/.test(line); // <tag>text</tag> on one line
    if (isOpening && !isSelfClosing && !isInline) depth++;
  }
  return { ok: true, value: out.join('\n') };
}

/** Format a raw request body for the given raw type. `text` is returned unchanged. */
export function formatRawBody(input: string, type: RawType): FormatResult {
  if (type === 'json') return formatJson(input);
  if (type === 'xml') return formatXml(input);
  return { ok: true, value: input };
}
