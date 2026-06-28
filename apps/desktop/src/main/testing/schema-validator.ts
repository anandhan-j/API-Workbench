import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

/** Validates data against a JSON Schema, returning a flat list of errors. */
export function validateJsonSchema(
  schema: Record<string, unknown>,
  data: unknown,
): { valid: boolean; errors: string[] } {
  try {
    const validate = ajv.compile(schema);
    const valid = validate(data) as boolean;
    const errors = (validate.errors ?? []).map(
      (e) => `${e.instancePath || '(root)'} ${e.message ?? 'invalid'}`,
    );
    return { valid, errors };
  } catch (error) {
    return { valid: false, errors: [`Invalid schema: ${(error as Error).message}`] };
  }
}
