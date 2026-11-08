import { expect, it } from 'vitest';
import { ErrorBodySchema } from './error-body.js';

// SRD §11; NFR-SC-1.
const body = { code: 'NOT_FOUND', message: 'Missing', requestId: 'abc' };
it('ErrorBodySchema accepts a valid body', () => {
  expect(ErrorBodySchema.parse(body)).toEqual(body);
});
it('ErrorBodySchema rejects unknown codes', () => {
  expect(ErrorBodySchema.safeParse({ ...body, code: 'TEAPOT' }).success).toBe(false);
});
it('ErrorBodySchema rejects extra keys', () => {
  expect(ErrorBodySchema.safeParse({ ...body, stack: '...' }).success).toBe(false);
});
