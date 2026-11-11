import { z } from 'zod';

export const EVENT_IMPACTS = ['High', 'Medium', 'Low', 'Holiday'] as const;

/** A scheduled release or speech (CPI, Fed, ECB, payrolls…), with what it usually moves. Times are ISO with offset. */
export const EconomicEventSchema = z.strictObject({
  id: z.string(), title: z.string(), country: z.string(), at: z.string(), impact: z.enum(EVENT_IMPACTS),
  forecast: z.string().nullable(), previous: z.string().nullable(), moves: z.array(z.string()),
});
export type EconomicEvent = z.infer<typeof EconomicEventSchema>;
export const CalendarResponseSchema = z.strictObject({ events: z.array(EconomicEventSchema) });

export const CalendarQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(14).default(7),
  /** Lowest impact to include. */
  impact: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  country: z.string().regex(/^[A-Z]{3}$/).optional(),
});
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
