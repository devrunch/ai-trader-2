import { z } from 'zod';
import { INTERVALS } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

const SYMBOL = z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/, 'canonical EXCHANGE:TICKER id');

/** Read-only application services the agent may use (FR-AG-5). There is deliberately no write service here (FR-AG-4). */
export interface ReadToolServices {
  quote: { execute(instrumentId: string): Promise<unknown> };
  market: { bars(instrumentId: string, interval: (typeof INTERVALS)[number], cursor: { latest: true }, limit: number): Promise<unknown> };
  search: { execute(q: string, opts?: { limit?: number }): unknown };
  portfolio: { account(userId: string): Promise<unknown>; positions(userId: string): Promise<unknown>; orders(userId: string, filter: { openOnly: boolean; limit: number }): Promise<unknown> };
}

export function buildReadTools(s: ReadToolServices, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  const tools = [
    guardedTool({ name: 'getQuote', description: 'Last price and change against the previous close for one instrument, with its data status.',
      input: z.strictObject({ symbol: SYMBOL }), run: input => s.quote.execute(input.symbol) }, deps),
    guardedTool({ name: 'getBars', description: 'The latest OHLCV bars for one instrument and interval (at most 500).',
      input: z.strictObject({ symbol: SYMBOL, interval: z.enum(INTERVALS), limit: z.number().int().min(1).max(500).default(200) }),
      run: input => s.market.bars(input.symbol, input.interval, { latest: true }, input.limit) }, deps),
    guardedTool({ name: 'searchInstruments', description: 'Find instruments by name or ticker; returns canonical ids.',
      input: z.strictObject({ query: z.string().min(1).max(64), limit: z.number().int().min(1).max(20).default(10) }),
      run: input => Promise.resolve(s.search.execute(input.query, { limit: input.limit })) }, deps),
    // The account is always the caller's own: the user id comes from the session, never from the model (FR-AG-5).
    guardedTool({ name: 'getPortfolio', description: "The user's own paper account: cash, positions with P&L, and open orders. Read-only.",
      input: z.object({}).passthrough(), run: async (_input, ctx) => ({
        account: await s.portfolio.account(ctx.userId), positions: await s.portfolio.positions(ctx.userId),
        openOrders: await s.portfolio.orders(ctx.userId, { openOnly: true, limit: 50 }),
      }) }, deps),
  ];
  return tools as Array<GuardedTool<unknown, unknown>>;
}
