import { z } from 'zod';

export const INTERVALS = ['1', '3', '5', '15', '30', '60', '240', '1D', '1W', '1M'] as const;
export const PROVIDER_REASONS = ['NO_DATA', 'MARKET_CLOSED', 'UNSUPPORTED', 'RATE_LIMITED', 'PROVIDER_DOWN', 'AUTH_EXPIRED'] as const;
export type ProviderReason = (typeof PROVIDER_REASONS)[number];

export const DataStatusSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('ok') }),
  z.strictObject({ state: z.literal('delayed'), delayMs: z.number().int().positive() }),
  z.strictObject({ state: z.literal('stale'), reason: z.enum(PROVIDER_REASONS), detail: z.string().optional() }),
]);
export type DataStatus = z.infer<typeof DataStatusSchema>;

export const BarSchema = z.strictObject({
  time: z.number().int(), open: z.number(), high: z.number(), low: z.number(), close: z.number(),
  volume: z.number().nullable(), repaired: z.boolean().optional(),
});
export const BarUpdateSchema = z.strictObject({
  instrumentId: z.string(), seq: z.number().int().positive(), kind: z.enum(['forming', 'closed']), bar: BarSchema, at: z.number().int(),
});
export type BarUpdate = z.infer<typeof BarUpdateSchema>;
export const BarSeqResponseSchema = z.strictObject({ instrumentId: z.string(), seq: z.number().int().nonnegative() });
export type BarSeqResponse = z.infer<typeof BarSeqResponseSchema>;

export const BarsResponseSchema = z.strictObject({
  instrumentId: z.string(), resolvedId: z.string(), interval: z.enum(INTERVALS),
  bars: z.array(BarSchema), nextBefore: z.number().int().nullable(), status: DataStatusSchema,
});
export type BarsResponse = z.infer<typeof BarsResponseSchema>;

export const QuoteResponseSchema = z.strictObject({
  instrumentId: z.string(), resolvedId: z.string(), price: z.number(), change: z.number().nullable(),
  changePct: z.number().nullable(), at: z.number().int(), status: DataStatusSchema,
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;
