import { z } from 'zod';

export const INSTRUMENT_TYPES = ['stock', 'index', 'futures', 'option', 'forex', 'metal', 'commodity', 'etf', 'bond'] as const;
export const InstrumentSummarySchema = z.strictObject({
  id: z.string(), description: z.string(), exchange: z.string(), type: z.enum(INSTRUMENT_TYPES),
  currency: z.string(), status: z.enum(['active', 'suspended', 'delisted', 'expired']),
});
export const InstrumentSchema = InstrumentSummarySchema.extend({
  ticker: z.string(), timezone: z.string(), session: z.string(), pricescale: z.number(), minmov: z.number(), lotSize: z.number(),
  expiry: z.string().optional(), strike: z.number().optional(), optionType: z.enum(['CE', 'PE']).optional(),
  underlying: z.string().optional(), isin: z.string().optional(), sector: z.string().optional(),
  hasIntraday: z.boolean(), volumeType: z.enum(['real', 'tick', 'none']), aliases: z.array(z.string()),
});
export const InstrumentSearchResponseSchema = z.strictObject({ query: z.string(), results: z.array(InstrumentSummarySchema) });
export const ResolvedInstrumentResponseSchema = z.strictObject({
  instrument: InstrumentSchema, via: z.enum(['renamed', 'continuous']).optional(), resolvedFrom: z.string().optional(),
});
export type InstrumentSummary = z.infer<typeof InstrumentSummarySchema>;
