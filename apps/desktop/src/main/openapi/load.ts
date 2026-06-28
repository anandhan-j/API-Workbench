import type { ImportSource } from '@shared/openapi';
import { OpenApiImportError } from './parser';

export type FetchText = (url: string) => Promise<string>;

export async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new OpenApiImportError(`Failed to fetch spec (${response.status} ${response.statusText})`);
  }
  return response.text();
}

/** Resolves spec content from an inline-text or remote-URL source. */
export async function loadSpecContent(
  source: ImportSource,
  fetchText: FetchText = defaultFetchText,
): Promise<string> {
  if (source.type === 'text') return source.content;
  return fetchText(source.url);
}
