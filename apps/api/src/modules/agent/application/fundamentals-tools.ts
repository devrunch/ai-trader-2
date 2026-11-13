import { z } from 'zod';
import type { FundamentalsResponse } from '@aitrader/contracts';
import { guardedTool, type GuardDeps, type GuardedTool } from './guarded-tool';

/** The fundamentals module's application API, as the agent sees it. */
export interface FundamentalsPort { get(symbol: string, asOf?: number): Promise<FundamentalsResponse | null> }

const NOT_AVAILABLE = 'not available for non-NSE-stock instruments: fundamentals exist only for NSE stocks (NSE:TICKER)';

export function buildFundamentalsTools(fundamentals: FundamentalsPort, deps: GuardDeps): Array<GuardedTool<unknown, unknown>> {
  return [
    guardedTool({ name: 'getFundamentals', description: 'Company fundamentals for an NSE stock (NSE:TICKER only): market cap, P/E, book value, ROE, ROCE, dividend yield, debt/equity, 3y/5y sales and profit growth, '
        + 'promoter/FII/DII holding, latest quarterly and annual results. Not available for non-NSE-stock instruments (forex, crypto, indices, US stocks). Figures are as of the stated fetchedAt and reportDate; stale=true means the refresh failed.',
      input: z.strictObject({ symbol: z.string().regex(/^[A-Z0-9_]+:[A-Z0-9_&.!-]+$/, 'canonical EXCHANGE:TICKER id'), asOf: z.iso.datetime({ offset: true }).optional() }),
      run: async input => {
        if (!input.symbol.startsWith('NSE:')) return { available: false, reason: NOT_AVAILABLE };
        const record = await fundamentals.get(input.symbol, input.asOf ? Date.parse(input.asOf) : undefined);
        if (!record) return { available: false, reason: 'no fundamentals stored for this company at that time' };
        return { available: true, source: record.source, fetchedAt: record.fetchedAt, reportDate: record.reportDate, stale: record.stale, symbol: record.symbol, name: record.name,
          consolidated: record.consolidated, ratios: record.ratios, shareholding: record.shareholding, quarterly: record.quarterly.slice(-6), annual: record.annual.slice(-5) };
      } }, deps),
  ];
}
