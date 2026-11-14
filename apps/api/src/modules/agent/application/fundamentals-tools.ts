import { z } from 'zod';
import type { FundamentalsResponse } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

/** The fundamentals module's application API, as the agent sees it. */
export interface FundamentalsPort {
  get(symbol: string, asOf?: number): Promise<FundamentalsResponse | null>;
  /** A US-listed company's figures; undefined when the symbol is not a US listing. */
  us(symbol: string): Promise<Record<string, unknown> | null> | undefined;
}

const NOT_A_COMPANY = 'fundamentals cover companies listed on NSE and US exchanges; an index, currency, commodity or coin has none';

export function buildFundamentalsTools(fundamentals: FundamentalsPort, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'getFundamentals', description: 'Company fundamentals. NSE stocks (NSE:TICKER): market cap, P/E, book value, ROE, ROCE, dividend yield, debt/equity, 3y/5y sales and profit growth, '
        + 'promoter/FII/DII holding, latest quarterly and annual results. US stocks (NASDAQ:/NYSE:): market cap, P/E, forward P/E, PEG, price/book, EPS, dividend yield, ROE, margin, '
        + 'revenue and earnings growth, beta, 52-week range, analyst target. Not for indices, forex, commodities or crypto. Leave asOf out unless replaying a past moment.',
      input: z.strictObject({ symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/, 'canonical EXCHANGE:TICKER id'), asOf: z.iso.datetime({ offset: true }).optional() }),
      run: async input => {
        const us = fundamentals.us(input.symbol);
        if (us !== undefined) {
          const record = await us;
          return record ? { available: true, market: 'us', ...record } : { available: false, reason: 'no US fundamentals for this ticker' };
        }
        if (!input.symbol.startsWith('NSE:')) return { available: false, reason: NOT_A_COMPANY };
        const asOf = input.asOf ? Date.parse(input.asOf) : undefined;
        const past = await fundamentals.get(input.symbol, asOf);
        const record = past ?? (asOf === undefined ? null : await fundamentals.get(input.symbol));
        if (!record) return { available: false, reason: 'no fundamentals for this company yet' };
        return { available: true, market: 'india', source: record.source, fetchedAt: record.fetchedAt, reportDate: record.reportDate, stale: record.stale, symbol: record.symbol, name: record.name,
          ...(past === null ? { note: 'no record as of the asked time; these are the current figures' } : {}),
          consolidated: record.consolidated, ratios: record.ratios, shareholding: record.shareholding, quarterly: record.quarterly.slice(-6), annual: record.annual.slice(-5) };
      } }, deps),
  ];
}
