import { z } from 'zod';

const Level = z.strictObject({ price: z.number(), quantity: z.number(), /** Number of orders at the level (NSE/BSE only). */ orders: z.number().int().nullable() });
/** The latest order book for an instrument: 5 levels each side for NSE/BSE (Kite full mode); top of book for Deriv. */
export const DepthSchema = z.strictObject({
  instrumentId: z.string(), at: z.number(), source: z.string(), levels: z.enum(['5', '1']),
  bids: z.array(Level).max(5), asks: z.array(Level).max(5),
  spread: z.number().nullable(), spreadPct: z.number().nullable(),
  totalBidQty: z.number(), totalAskQty: z.number(),
  /** (bid - ask) / (bid + ask) over the shown levels: +1 all buyers, -1 all sellers. */
  imbalance: z.number().nullable(),
});
export type Depth = z.infer<typeof DepthSchema>;
export type DepthLevel = z.infer<typeof Level>;
/** `unavailable` says why there is no book (market closed, no feed for this instrument, not subscribed yet). */
export const DepthResponseSchema = z.strictObject({ depth: DepthSchema.nullable(), unavailable: z.string().nullable() });
export type DepthResponse = z.infer<typeof DepthResponseSchema>;
