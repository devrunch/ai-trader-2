import { z } from 'zod';
import { ERROR_CODES } from './error-codes.js';
export const ErrorBodySchema = z.strictObject({
  code: z.enum(ERROR_CODES),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().min(1),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
