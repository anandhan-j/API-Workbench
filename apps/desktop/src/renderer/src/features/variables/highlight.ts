/** A run of text, flagged as a `{{variable}}` token or plain text. */
export interface Segment {
  text: string;
  token: boolean;
}

const TOKEN = /\{\{[^}]*\}\}/g;

/**
 * Splits text into alternating plain / `{{token}}` segments, preserving order
 * and content exactly (so the join of all `text` equals the input). Used to
 * render a syntax-highlighted backdrop behind a transparent input.
 */
export function splitHighlight(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), token: false });
    segments.push({ text: match[0], token: true });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), token: false });
  return segments;
}
