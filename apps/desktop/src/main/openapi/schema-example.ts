/**
 * Generates representative example values from JSON Schema / OpenAPI schema
 * objects, resolving `$ref` against the spec document. Used by the normalizer to
 * pre-populate a request's body when the spec provides only a schema (no example).
 *
 * Cycle- and depth-guarded so self-referential schemas cannot recurse forever.
 */

const MAX_DEPTH = 8;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A `$ref` resolver bound to a spec document (supports `#/a/b/c` pointers). */
export function makeRefResolver(
  document: Record<string, unknown>,
): (ref: string) => Record<string, unknown> | null {
  return (ref: string) => {
    if (!ref.startsWith('#/')) return null;
    const segments = ref
      .slice(2)
      .split('/')
      .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current: unknown = document;
    for (const segment of segments) {
      const record = asRecord(current);
      if (!record || !(segment in record)) return null;
      current = record[segment];
    }
    return asRecord(current);
  };
}

function exampleForString(format: unknown): string {
  switch (format) {
    case 'date-time':
      return '1970-01-01T00:00:00Z';
    case 'date':
      return '1970-01-01';
    case 'uuid':
      return '00000000-0000-0000-0000-000000000000';
    case 'email':
      return 'user@example.com';
    case 'uri':
    case 'url':
      return 'https://example.com';
    case 'byte':
      return '';
    default:
      return 'string';
  }
}

/** Produces an example value for a schema, resolving refs and merging allOf. */
export function schemaToExample(
  schema: unknown,
  resolve: (ref: string) => Record<string, unknown> | null,
  seen: ReadonlySet<string> = new Set(),
  depth = 0,
): unknown {
  if (depth > MAX_DEPTH) return null;
  const s = asRecord(schema);
  if (!s) return null;

  if (typeof s['$ref'] === 'string') {
    const ref = s['$ref'];
    if (seen.has(ref)) return null;
    const target = resolve(ref);
    if (!target) return null;
    return schemaToExample(target, resolve, new Set([...seen, ref]), depth + 1);
  }

  if (s['example'] !== undefined) return s['example'];
  if (s['default'] !== undefined) return s['default'];
  if (Array.isArray(s['enum']) && s['enum'].length > 0) return s['enum'][0];

  if (Array.isArray(s['allOf'])) {
    const merged: Record<string, unknown> = {};
    for (const sub of s['allOf']) {
      const value = schemaToExample(sub, resolve, seen, depth + 1);
      const record = asRecord(value);
      if (record) Object.assign(merged, record);
    }
    Object.assign(merged, objectFromProperties(s['properties'], resolve, seen, depth));
    return merged;
  }

  const variants = s['oneOf'] ?? s['anyOf'];
  if (Array.isArray(variants) && variants.length > 0) {
    return schemaToExample(variants[0], resolve, seen, depth + 1);
  }

  const type = s['type'];
  if (type === 'object' || s['properties']) {
    return objectFromProperties(s['properties'], resolve, seen, depth);
  }
  if (type === 'array') {
    const item = schemaToExample(s['items'], resolve, seen, depth + 1);
    return item === undefined || item === null ? [] : [item];
  }

  switch (type) {
    case 'string':
      return exampleForString(s['format']);
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    default:
      return null;
  }
}

function objectFromProperties(
  properties: unknown,
  resolve: (ref: string) => Record<string, unknown> | null,
  seen: ReadonlySet<string>,
  depth: number,
): Record<string, unknown> {
  const props = asRecord(properties);
  const out: Record<string, unknown> = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    out[key] = schemaToExample(value, resolve, seen, depth + 1);
  }
  return out;
}

/** Coerces an example value to a scalar string for header/param/form fields. */
export function scalarString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
