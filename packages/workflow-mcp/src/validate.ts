import { createRequire } from 'node:module';

import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

import { getSchema, type SchemaRoot } from './schema.js';

// `ajv-formats` is CJS whose `module.exports` is the plugin function; `require`
// hands it back directly, sidestepping ESM default-interop typing friction.
const require = createRequire(import.meta.url);
const addFormats = require('ajv-formats') as (ajv: Ajv, opts?: unknown) => Ajv;

/**
 * Validates candidate workflow JSON against the generated schema and turns Ajv's
 * output into actionable, self-correcting error messages.
 *
 * The hard part is unions. A workflow node is a discriminated union (on `kind`),
 * so a single malformed node makes Ajv emit an error for *every* arm — dozens of
 * "must be equal to constant" lines that bury the real problem. `reduceErrors`
 * prunes the rejected arms: the arm the author actually intended is the one
 * whose discriminator matched (it produced no discriminator error), so every
 * error sharing a schema path with a *rejected* arm is dropped. What remains is
 * the real mistake — or, if no arm matched, a single "must be one of …" line.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validators: Record<SchemaRoot, ValidateFunction> = {
  export: ajv.compile(getSchema('export')),
  graph: ajv.compile(getSchema('graph')),
};

/** Discriminator fields used by the workflow schema's unions. */
const DISCRIMINATOR_FIELDS = new Set(['kind', 'type', 'mode']);
/** Ajv keywords that summarise a combinator rather than a concrete failure. */
const COMBINATOR_KEYWORDS = new Set(['anyOf', 'oneOf', 'if', 'not']);

export interface FormattedError {
  /** JSON pointer into the workflow, e.g. `/workflows/0/graph/nodes/2/kind`. */
  path: string;
  /** Actionable, human/model readable description. */
  message: string;
  keyword: string;
}

export interface ValidationResult {
  valid: boolean;
  root: SchemaRoot;
  errors: FormattedError[];
}

function lastSegment(instancePath: string): string {
  const parts = instancePath.split('/');
  return parts[parts.length - 1] ?? '';
}

function parentOf(instancePath: string): string {
  const idx = instancePath.lastIndexOf('/');
  return idx <= 0 ? '' : instancePath.slice(0, idx);
}

function isInScope(instancePath: string, parent: string): boolean {
  if (parent === '') return true;
  return instancePath === parent || instancePath.startsWith(`${parent}/`);
}

function isDiscriminatorReject(err: ErrorObject): boolean {
  const field = lastSegment(err.instancePath);
  if (!DISCRIMINATOR_FIELDS.has(field)) return false;
  if (err.keyword === 'const') return true;
  // The plugin-node arm matches `kind` by regex, so a built-in kind fails it as `pattern`.
  return field === 'kind' && err.keyword === 'pattern';
}

/** The schema location of the union arm an error belongs to. */
function armPrefix(err: ErrorObject): string {
  const marker = '/properties/';
  const idx = err.schemaPath.lastIndexOf(marker);
  return idx === -1 ? err.schemaPath : err.schemaPath.slice(0, idx);
}

/** Resolve the value a JSON pointer points at, for "got X" context. */
function resolvePointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  let current: unknown = root;
  for (const rawKey of pointer.split('/').slice(1)) {
    const key = rawKey.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      current = current[Number(key)];
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function preview(value: unknown): string {
  if (value === undefined) return 'undefined';
  const json = JSON.stringify(value);
  if (json === undefined) return String(value);
  return json.length > 60 ? `${json.slice(0, 57)}…` : json;
}

function describe(err: ErrorObject, data: unknown): string {
  const path = err.instancePath || '(root)';
  const params = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case 'required':
      return `${path}/${String(params.missingProperty)} is required but missing`;
    case 'additionalProperties':
      return `${path}/${String(params.additionalProperty)} is not a recognized property`;
    case 'enum': {
      const allowed = (params.allowedValues as unknown[]) ?? [];
      return `${path} must be one of [${allowed.map((v) => JSON.stringify(v)).join(', ')}]; got ${preview(resolvePointer(data, err.instancePath))}`;
    }
    case 'const':
      return `${path} must be ${JSON.stringify(params.allowedValue)}; got ${preview(resolvePointer(data, err.instancePath))}`;
    case 'type':
      return `${path} must be ${String(params.type)}; got ${preview(resolvePointer(data, err.instancePath))}`;
    case 'minItems':
      return `${path} must have at least ${String(params.limit)} item(s)`;
    case 'minimum':
    case 'maximum':
      return `${path} must be ${err.keyword === 'minimum' ? '>=' : '<='} ${String(params.limit)}; got ${preview(resolvePointer(data, err.instancePath))}`;
    case 'pattern':
      return `${path} must match ${String(params.pattern)}; got ${preview(resolvePointer(data, err.instancePath))}`;
    default:
      return `${path} ${err.message ?? 'is invalid'}`;
  }
}

interface RejectGroup {
  /** Schema-location prefixes of the union arms rejected at this data location. */
  armPrefixes: string[];
  /** The literal values the discriminator const-arms allow. */
  allowed: string[];
  /** Whether a regex/pattern arm (e.g. the plugin-node arm) was among the rejects. */
  hasPattern: boolean;
  field: string;
  /** Instance path of the discriminator field, e.g. `/…/nodes/2/kind`. */
  fieldPath: string;
}

function reduceErrors(errors: ErrorObject[], data: unknown): FormattedError[] {
  const concrete = errors.filter((err) => !COMBINATOR_KEYWORDS.has(err.keyword));

  // 1) Group rejected arms by the *data location* of their discriminator. This
  //    scoping is essential: schemaPath is identical for every node (they share
  //    one items schema), so a global prefix list would let one bad node prune
  //    another good node's matching arm.
  const groups = new Map<string, RejectGroup>();
  for (const err of concrete) {
    if (!isDiscriminatorReject(err)) continue;
    const parent = parentOf(err.instancePath);
    let group = groups.get(parent);
    if (!group) {
      group = { armPrefixes: [], allowed: [], hasPattern: false, field: lastSegment(err.instancePath), fieldPath: err.instancePath };
      groups.set(parent, group);
    }
    group.armPrefixes.push(armPrefix(err));
    if (err.keyword === 'const') {
      group.allowed.push(JSON.stringify((err.params as Record<string, unknown>).allowedValue));
    } else if (err.keyword === 'pattern') {
      group.hasPattern = true;
    }
  }

  // 2) Keep concrete errors that are neither a discriminator reject nor part of a
  //    rejected arm at a data location that contains them. The trailing '/' on
  //    the prefix keeps `anyOf/1` from matching `anyOf/10`.
  const kept = concrete.filter((err) => {
    if (isDiscriminatorReject(err)) return false;
    for (const [parent, group] of groups) {
      if (!isInScope(err.instancePath, parent)) continue;
      if (group.armPrefixes.some((prefix) => err.schemaPath.startsWith(`${prefix}/`))) return false;
    }
    return true;
  });

  const formatted: FormattedError[] = [];
  const seen = new Set<string>();
  const push = (path: string, message: string, keyword: string): void => {
    const dedupeKey = `${path}::${message}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    formatted.push({ path, message, keyword });
  };

  // 3) Where the discriminator value itself is invalid and no arm survived,
  //    synthesise one clear "must be one of …" message.
  for (const [parent, group] of groups) {
    const actual = resolvePointer(data, group.fieldPath);
    const actualAllowed = group.allowed.includes(JSON.stringify(actual));
    const armMatched = kept.some((err) => isInScope(err.instancePath, parent));
    if (actualAllowed || armMatched) continue;
    const uniqueAllowed = [...new Set(group.allowed)];
    const pluginHint =
      group.field === 'kind' && group.hasPattern
        ? ' (or a plugin kind matching `plugin:<id>/<kind>`)'
        : '';
    push(
      group.fieldPath,
      `${group.fieldPath} must be one of [${uniqueAllowed.join(', ')}]${pluginHint}; got ${preview(actual)}`,
      'discriminator',
    );
  }

  // 4) Emit the surviving concrete errors.
  for (const err of kept) {
    push(err.instancePath || '(root)', describe(err, data), err.keyword);
  }

  return formatted;
}

export function validateWorkflow(data: unknown, root: SchemaRoot = 'export'): ValidationResult {
  const validate = validators[root];
  const valid = validate(data) as boolean;
  if (valid) return { valid: true, root, errors: [] };
  const errors = reduceErrors((validate.errors ?? []) as ErrorObject[], data);
  return { valid: false, root, errors };
}
