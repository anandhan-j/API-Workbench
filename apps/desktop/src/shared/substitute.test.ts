import { describe, expect, it } from 'vitest';
import { deepSubstitute } from './substitute';

const evaluate = (template: string) => template.replaceAll('{{host}}', 'example.com');

describe('deepSubstitute', () => {
  it('substitutes strings at any depth', () => {
    const result = deepSubstitute(
      {
        url: 'wss://{{host}}/feed',
        nested: { list: ['{{host}}', 42, true], metadata: { origin: '{{host}}' } },
      },
      evaluate,
    );
    expect(result).toEqual({
      url: 'wss://example.com/feed',
      nested: { list: ['example.com', 42, true], metadata: { origin: 'example.com' } },
    });
  });

  it('leaves non-string primitives and null untouched', () => {
    expect(deepSubstitute(7, evaluate)).toBe(7);
    expect(deepSubstitute(null, evaluate)).toBeNull();
    expect(deepSubstitute(false, evaluate)).toBe(false);
  });

  it('does not mutate the input', () => {
    const payload = { url: '{{host}}' };
    deepSubstitute(payload, evaluate);
    expect(payload.url).toBe('{{host}}');
  });
});
