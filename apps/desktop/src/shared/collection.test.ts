import { describe, expect, it } from 'vitest';
import { CreateRequestInput, RequestSummary } from './collection';

const baseSummary = {
  id: 'r1',
  collectionId: 'c1',
  folderId: null,
  method: 'POST' as const,
  url: '{{API_baseUrl}}/origins',
  favorite: false,
  position: 0,
  createdAt: 1,
  updatedAt: 1,
};

describe('RequestSummary', () => {
  it('accepts an empty name (operation imported with no summary)', () => {
    const parsed = RequestSummary.parse({ ...baseSummary, name: '' });
    expect(parsed.name).toBe('');
  });

  it('accepts a normal name', () => {
    expect(RequestSummary.parse({ ...baseSummary, name: 'Create origin' }).name).toBe(
      'Create origin',
    );
  });
});

describe('CreateRequestInput', () => {
  it('still requires a non-empty name when creating a request', () => {
    expect(() =>
      CreateRequestInput.parse({ collectionId: 'c1', name: '' }),
    ).toThrow();
  });
});
