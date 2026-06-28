import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportResult } from '@shared/openapi';
import { ImportPanel } from './ImportPanel';

describe('<ImportPanel />', () => {
  it('submits pasted spec text as a text source', async () => {
    const onImport = vi.fn();
    const user = userEvent.setup();
    render(<ImportPanel onImport={onImport} />);

    fireEvent.change(screen.getByLabelText('OpenAPI document'), {
      target: { value: '{"openapi":"3.0.0"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(onImport).toHaveBeenCalledWith({
      source: { type: 'text', content: '{"openapi":"3.0.0"}' },
    });
  });

  it('switches to URL mode and submits a url source', async () => {
    const onImport = vi.fn();
    const user = userEvent.setup();
    render(<ImportPanel onImport={onImport} />);

    await user.click(screen.getByRole('button', { name: 'From URL' }));
    await user.type(screen.getByLabelText('OpenAPI URL'), 'https://x.test/spec.json');
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(onImport).toHaveBeenCalledWith({
      source: { type: 'url', url: 'https://x.test/spec.json' },
    });
  });

  it('renders an import result summary', () => {
    const result: ImportResult = {
      collectionId: 'c1',
      collectionName: 'Petstore',
      specVersion: 'openapi-3',
      format: 'json',
      title: 'Petstore',
      apiVersion: '1.0',
      baseUrl: 'https://api',
      foldersCreated: 2,
      requestsCreated: 4,
      operationCount: 4,
      schemaCount: 3,
      exampleCount: 1,
    };
    render(<ImportPanel onImport={vi.fn()} result={result} />);
    expect(screen.getByText(/Imported “Petstore”/)).toBeInTheDocument();
    expect(screen.getByText(/4 requests in 2 folders/)).toBeInTheDocument();
  });
});
