import { z } from 'zod';

/**
 * Declarative form schemas (Phase 16, ADR-0007).
 *
 * Plugins describe their config UIs (node config, auth config, request-type
 * payload editors) as data: a flat list of typed fields. The renderer draws
 * them with one generic `SchemaForm` component, and the main process compiles
 * them to Zod ({@link compileFormSchemaToZod}) to validate values before any
 * plugin code runs. No plugin code ever executes in the renderer.
 */

const fieldBase = {
  /** Value key; unique within the form. */
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  required: z.boolean().default(false),
  /**
   * Whether `{{variable}}` templates in this field's value are substituted
   * before execution. Off for fields whose braces are literal (e.g. payloads
   * in another template language).
   */
  substituteVariables: z.boolean().default(true),
};

export const FormField = z.discriminatedUnion('kind', [
  z.object({
    ...fieldBase,
    kind: z.literal('string'),
    placeholder: z.string().optional(),
    default: z.string().optional(),
    pattern: z.string().optional(),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('textarea'),
    placeholder: z.string().optional(),
    default: z.string().optional(),
    language: z.enum(['text', 'json']).default('text'),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('number'),
    default: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    integer: z.boolean().default(false),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('boolean'),
    default: z.boolean().optional(),
  }),
  z.object({
    ...fieldBase,
    kind: z.literal('select'),
    options: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .min(1)
      .max(50),
    default: z.string().optional(),
  }),
  z.object({
    ...fieldBase,
    /** Masked input; encrypted at rest when stored in a credential config. */
    kind: z.literal('secret'),
  }),
  z.object({
    ...fieldBase,
    /** A string→string grid (headers, metadata, …). */
    kind: z.literal('keyvalue'),
  }),
]);
export type FormField = z.infer<typeof FormField>;

export const MAX_FORM_FIELDS = 40;

export const FormSchema = z.object({
  fields: z
    .array(FormField)
    .max(MAX_FORM_FIELDS)
    .refine(
      (fields) => new Set(fields.map((f) => f.key)).size === fields.length,
      'Form field keys must be unique',
    ),
});
export type FormSchema = z.infer<typeof FormSchema>;

/** The value object a form produces, keyed by field key. */
export type FormValues = Record<string, unknown>;

function fieldToZod(field: FormField): z.ZodType {
  switch (field.kind) {
    case 'string':
    case 'textarea': {
      let s = z.string();
      if (field.kind === 'string' && field.pattern) {
        try {
          s = s.regex(new RegExp(field.pattern));
        } catch {
          // An invalid author-supplied pattern must not make the form unusable.
        }
      }
      return field.required ? s.min(1) : s;
    }
    case 'secret':
      return field.required ? z.string().min(1) : z.string();
    case 'number': {
      let n = z.number();
      if (field.integer) n = n.int();
      if (field.min !== undefined) n = n.min(field.min);
      if (field.max !== undefined) n = n.max(field.max);
      return n;
    }
    case 'boolean':
      return z.boolean();
    case 'select':
      return z.enum(field.options.map((o) => o.value) as [string, ...string[]]);
    case 'keyvalue':
      return z.record(z.string());
  }
}

function fieldDefault(field: FormField): unknown {
  if ('default' in field && field.default !== undefined) return field.default;
  switch (field.kind) {
    case 'string':
    case 'textarea':
    case 'secret':
      return '';
    case 'number':
      return undefined;
    case 'boolean':
      return false;
    case 'select':
      return field.options[0]?.value;
    case 'keyvalue':
      return {};
  }
}

/**
 * Compiles a form schema to a Zod object validating the form's value object.
 * Optional fields accept absence; every field gets its declared (or natural)
 * default so parsed values are fully populated.
 */
export function compileFormSchemaToZod(schema: FormSchema): z.ZodType<FormValues> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of schema.fields) {
    let type = fieldToZod(field);
    const dflt = fieldDefault(field);
    if (!field.required && dflt !== undefined) {
      type = type.optional().default(dflt as never);
    } else if (!field.required) {
      type = type.optional();
    }
    shape[field.key] = type;
  }
  return z.object(shape);
}

/** The fully-defaulted initial value object for a form (new node/config seeds). */
export function formDefaults(schema: FormSchema): FormValues {
  const out: FormValues = {};
  for (const field of schema.fields) {
    const dflt = fieldDefault(field);
    if (dflt !== undefined) out[field.key] = dflt;
  }
  return out;
}
