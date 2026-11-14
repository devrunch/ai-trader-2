import { z } from 'zod';

/** One side (call or put) of a strike. `oiChange` is against the previous trading day's close snapshot, null until one exists. */
export const OptionLegSchema = z.strictObject({
  symbol: z.string(),
  ltp: z.number().nullable(),
  oi: z.number().nullable(),
  oiChange: z.number().nullable(),
  volume: z.number().nullable(),
  /** Implied volatility in percent, computed from the traded price; null when the price is missing or below intrinsic value. */
  iv: z.number().nullable(),
});
export type OptionLeg = z.infer<typeof OptionLegSchema>;

export const OptionChainRowSchema = z.strictObject({ strike: z.number(), ce: OptionLegSchema.nullable(), pe: OptionLegSchema.nullable() });

export const OptionChainSchema = z.strictObject({
  underlying: z.string(),
  expiry: z.string(),
  expiries: z.array(z.string()),
  spot: z.number().nullable(),
  /** Strike nearest to spot. */
  atm: z.number().nullable(),
  rows: z.array(OptionChainRowSchema),
  source: z.literal('kite'),
  /** When the snapshot was taken (ISO); snapshots are reused for a short while. */
  fetchedAt: z.string(),
});
export type OptionChain = z.infer<typeof OptionChainSchema>;

export const OptionsSummarySchema = z.strictObject({
  underlying: z.string(),
  expiry: z.string(),
  /** Put open interest over call open interest. */
  pcr: z.number().nullable(),
  maxPain: z.number().nullable(),
  totalCeOi: z.number(),
  totalPeOi: z.number(),
  /** Largest open-interest increases (calls and puts), biggest first. */
  buildups: z.array(z.strictObject({ strike: z.number(), type: z.enum(['CE', 'PE']), oi: z.number(), oiChange: z.number() })),
  source: z.literal('kite'),
  fetchedAt: z.string(),
});
export type OptionsSummary = z.infer<typeof OptionsSummarySchema>;

export const OptionChainQuerySchema = z.strictObject({
  expiry: z.iso.date().optional(),
  /** Strikes each side of the at-the-money strike. */
  strikes: z.coerce.number().int().min(1).max(30).default(10),
});
