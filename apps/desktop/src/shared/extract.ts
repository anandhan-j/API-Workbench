import { JSONPath } from 'jsonpath-plus';
import { search as jmesSearch } from 'jmespath';
import { statusOf, type ProtocolResponse } from './protocol';
import type { ExtractEngine, ExtractRule, TransformNodeConfig } from './workflow';

/**
 * Pure data-mapping helpers (Phase 15). Shared by the main-process engine (which
 * applies them during a run) and the renderer (which previews them live), so the
 * extraction semantics are defined exactly once and cannot drift between the two.
 *
 * Every function is total: a non-matching path, malformed JSON, or invalid
 * expression yields an empty string rather than throwing, which keeps runs
 * deterministic and previews safe.
 */

/** Renders any extracted value to a string suitable for a runtime variable. */
export function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Applies a path/regex engine to a piece of text, returning the first match. */
export function applyEngine(engine: ExtractEngine, text: string, expression: string): string {
  if (!expression) return '';
  try {
    if (engine === 'regex') {
      const match = new RegExp(expression).exec(text);
      return match ? stringify(match[1] ?? match[0]) : '';
    }
    const json = parseJson(text);
    if (json === undefined) return '';
    if (engine === 'jmespath') return stringify(jmesSearch(json, expression));
    const result = JSONPath({ path: expression, json, wrap: true }) as unknown[];
    return result.length ? stringify(result[0]) : '';
  } catch {
    return '';
  }
}

function headerValue(headers: Record<string, string>, name: string): string {
  const lower = name.trim().toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return '';
}

/**
 * Reads a single {@link ExtractRule} value out of a protocol response.
 * Protocol-agnostic sources: `status` reads the numeric status (HTTP status,
 * or the summary code for other types), `header` reads the metadata map
 * (HTTP: response headers), `body` applies the engine to the body text.
 */
export function extractFromResponse(response: ProtocolResponse, rule: ExtractRule): string {
  switch (rule.source) {
    case 'status':
      return String(statusOf(response));
    case 'header':
      return headerValue(response.metadata, rule.expression);
    case 'body':
      return applyEngine(rule.engine, response.body, rule.expression);
    default:
      return '';
  }
}

/** Applies every rule, returning a variable map (last rule wins on key clash). */
export function extractAll(response: ProtocolResponse, rules: ExtractRule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) out[rule.variable] = extractFromResponse(response, rule);
  return out;
}

/**
 * Computes a transform node's value. `template` evaluates a `{{ template }}`;
 * the path/regex engines resolve `input` to text then apply `expression`.
 */
export function applyTransform(
  config: TransformNodeConfig,
  resolveTemplate: (template: string) => string,
): string {
  if (config.engine === 'template') return resolveTemplate(config.expression);
  const text = resolveTemplate(config.input);
  return applyEngine(config.engine, text, config.expression);
}
