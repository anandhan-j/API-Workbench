import { z } from 'zod';
import { ExecutionResponse } from './execution';

/**
 * Transport DTOs for the Testing & Assertions engine (Phase 11).
 */

export const Comparator = z.enum([
  'equals',
  'notEquals',
  'contains',
  'matches',
  'exists',
  'lt',
  'lte',
  'gt',
  'gte',
]);
export type Comparator = z.infer<typeof Comparator>;

export const Assertion = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status'),
    comparator: Comparator.default('equals'),
    value: z.union([z.number(), z.array(z.number())]),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('header'),
    header: z.string(),
    comparator: Comparator.default('equals'),
    value: z.string().optional(),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('body'),
    /** JSONPath-lite, e.g. `$.data.items[0].id`. */
    path: z.string(),
    comparator: Comparator.default('equals'),
    value: z.string().optional(),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('jsonSchema'),
    schema: z.record(z.unknown()),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('responseTime'),
    comparator: z.enum(['lt', 'lte', 'gt', 'gte']).default('lt'),
    value: z.number(),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('script'),
    code: z.string(),
    name: z.string().optional(),
  }),
]);
export type Assertion = z.infer<typeof Assertion>;

export const AssertionResult = z.object({
  name: z.string(),
  type: z.string(),
  passed: z.boolean(),
  message: z.string(),
});
export type AssertionResult = z.infer<typeof AssertionResult>;

export const TestReport = z.object({
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  durationMs: z.number(),
  results: z.array(AssertionResult),
});
export type TestReport = z.infer<typeof TestReport>;

export const RunTestsRequest = z.object({
  response: ExecutionResponse,
  assertions: z.array(Assertion),
});
export type RunTestsRequest = z.infer<typeof RunTestsRequest>;
