/**
 * Declarative form schemas — how a plugin describes its config UIs (node
 * config, credential editor, request payload editor). The host renders these
 * with a generic form component and validates submitted values against them;
 * no plugin code runs in the UI.
 *
 * Mirrors the host's Zod authority (`shared/forms.ts` in the desktop app).
 */

interface FormFieldBase {
  /** Value key; unique within the form. Must match `[a-zA-Z][a-zA-Z0-9_]*`. */
  key: string;
  label: string;
  description?: string;
  /** Defaults to false. */
  required?: boolean;
  /**
   * Whether `{{variable}}` templates in this field's value are substituted
   * before execution. Defaults to true; disable for fields whose braces are
   * literal (e.g. payloads in another template language).
   */
  substituteVariables?: boolean;
}

export interface StringField extends FormFieldBase {
  kind: 'string';
  placeholder?: string;
  default?: string;
  /** Regular-expression source the value must match. */
  pattern?: string;
}

export interface TextareaField extends FormFieldBase {
  kind: 'textarea';
  placeholder?: string;
  default?: string;
  /** Defaults to 'text'. */
  language?: 'text' | 'json';
}

export interface NumberField extends FormFieldBase {
  kind: 'number';
  default?: number;
  min?: number;
  max?: number;
  /** Defaults to false. */
  integer?: boolean;
}

export interface BooleanField extends FormFieldBase {
  kind: 'boolean';
  default?: boolean;
}

export interface SelectField extends FormFieldBase {
  kind: 'select';
  options: Array<{ value: string; label: string }>;
  default?: string;
}

/** Masked input; encrypted at rest when stored in a credential config. */
export interface SecretField extends FormFieldBase {
  kind: 'secret';
}

/** A string→string grid (headers, metadata, …). */
export interface KeyValueField extends FormFieldBase {
  kind: 'keyvalue';
}

export type FormField =
  | StringField
  | TextareaField
  | NumberField
  | BooleanField
  | SelectField
  | SecretField
  | KeyValueField;

/** At most 40 fields per form. */
export interface FormSchema {
  fields: FormField[];
}

/** The value object a form produces, keyed by field key. */
export type FormValues = Record<string, unknown>;
