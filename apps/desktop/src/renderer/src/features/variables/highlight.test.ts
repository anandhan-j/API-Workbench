import { describe, expect, it } from 'vitest';
import { splitHighlight } from './highlight';

describe('splitHighlight', () => {
  it('returns a single plain segment for text without tokens', () => {
    expect(splitHighlight('hello world')).toEqual([{ text: 'hello world', token: false }]);
  });

  it('splits tokens from surrounding text', () => {
    expect(splitHighlight('https://{{base}}/users/{{id}}')).toEqual([
      { text: 'https://', token: false },
      { text: '{{base}}', token: true },
      { text: '/users/', token: false },
      { text: '{{id}}', token: true },
    ]);
  });

  it('handles a token at the very start and end', () => {
    expect(splitHighlight('{{a}}')).toEqual([{ text: '{{a}}', token: true }]);
  });

  it('round-trips: joined segments equal the input', () => {
    const input = 'a {{x}} b {{y}}{{z}} c';
    expect(splitHighlight(input).map((s) => s.text).join('')).toBe(input);
  });

  it('leaves an unclosed token as plain text', () => {
    expect(splitHighlight('{{open')).toEqual([{ text: '{{open', token: false }]);
  });
});
