import { z } from 'zod';
import type { DepthResponse } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

const SYMBOL = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/, 'canonical EXCHANGE:TICKER id');

/** Order-book tool. Depth is live-only, so there is no time parameter and nothing to replay. */
export function buildDepthTools(depth: { read(symbol: string): Promise<DepthResponse> }, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [guardedTool({ name: 'getDepth',
    description: 'The live order book: best 5 bid and ask levels (price, quantity, orders) for NSE/BSE, or just the best bid and ask for Deriv forex (no quantities). Also spread, spread percent, total bid and ask quantity and imbalance ((bid - ask) / (bid + ask), +1 all buyers). Live only: not available in a time-machine replay. When there is no book it says why (market closed, no order book for this instrument).',
    input: z.strictObject({ symbol: SYMBOL }),
    run: async input => {
      const { depth: book, unavailable } = await depth.read(input.symbol);
      if (!book) return { symbol: input.symbol, available: false, reason: unavailable ?? 'No order book available' };
      return { symbol: input.symbol, available: true, source: book.source, asOf: book.at, levels: book.levels, bids: book.bids, asks: book.asks,
        spread: book.spread, spreadPct: book.spreadPct, totalBidQty: book.totalBidQty, totalAskQty: book.totalAskQty, imbalance: book.imbalance };
    } }, deps)];
}
