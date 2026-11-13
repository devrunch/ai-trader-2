import { z } from 'zod';

const Num = z.number().nullable();

/** Ratios by the names a screen filters on (`FUNDAMENTAL_FIELDS`), plus the other holders. A figure the page did not show is null, never 0. */
export const FundamentalRatiosSchema = z.strictObject({
  marketCap: Num, pe: Num, bookValue: Num, roe: Num, roce: Num, dividendYield: Num, debtToEquity: Num,
  salesGrowth3y: Num, salesGrowth5y: Num, profitGrowth3y: Num, profitGrowth5y: Num,
  promoterHolding: Num, fiiHolding: Num, diiHolding: Num,
});
export type FundamentalRatios = z.infer<typeof FundamentalRatiosSchema>;

/** One reporting period of a results table (crore rupees; EPS in rupees; margin in percent). `period` is the column heading, for example "Sep 2025". */
export const FundamentalPeriodSchema = z.strictObject({ period: z.string(), sales: Num, operatingProfit: Num, opmPct: Num, netProfit: Num, eps: Num });
export type FundamentalPeriod = z.infer<typeof FundamentalPeriodSchema>;

/** Latest shareholding pattern, in percent of shares. */
export const ShareholdingSchema = z.strictObject({ period: z.string().nullable(), promoter: Num, fii: Num, dii: Num, public: Num });
export type Shareholding = z.infer<typeof ShareholdingSchema>;

export const FundamentalsSchema = z.strictObject({
  /** Canonical id, `NSE:TICKER`. */
  symbol: z.string().regex(/^NSE:[A-Z0-9&-]+$/),
  name: z.string().nullable(),
  /** True when the figures are the consolidated statements (the company has no standalone page). */
  consolidated: z.boolean(),
  source: z.string(),
  fetchedAt: z.iso.datetime(),
  /** Last day of the newest quarter with results (YYYY-MM-DD); the record is not visible to a replay before it. */
  reportDate: z.iso.date().nullable(),
  ratios: FundamentalRatiosSchema,
  quarterly: z.array(FundamentalPeriodSchema),
  annual: z.array(FundamentalPeriodSchema),
  shareholding: ShareholdingSchema,
});
export type Fundamentals = z.infer<typeof FundamentalsSchema>;

/** `stale` is true when the record is older than 24 hours because the refresh failed. */
export const FundamentalsResponseSchema = FundamentalsSchema.extend({ stale: z.boolean() });
export type FundamentalsResponse = z.infer<typeof FundamentalsResponseSchema>;
