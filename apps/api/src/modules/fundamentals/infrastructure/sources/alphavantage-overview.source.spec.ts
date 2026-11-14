import { describe, expect, it } from 'vitest';
import { UsFundamentalsService } from '../../application/us-fundamentals';
import { parseOverview } from './alphavantage-overview.source';

const overview = { Symbol: 'AAPL', Name: 'Apple Inc', Sector: 'TECHNOLOGY', Industry: 'ELECTRONIC COMPUTERS', Currency: 'USD', MarketCapitalization: '3400000000000',
  PERatio: '33.1', ForwardPE: '29.5', PEGRatio: 'None', PriceToBookRatio: '48.2', EPS: '6.42', DividendYield: '0.0044', ReturnOnEquityTTM: '1.57', ProfitMargin: '0.24',
  QuarterlyRevenueGrowthYOY: '0.061', QuarterlyEarningsGrowthYOY: '0.108', Beta: '1.24', '52WeekHigh': '260.1', '52WeekLow': '169.2', AnalystTargetPrice: '245', LatestQuarter: '2026-09-30' };

describe('parseOverview', () => {
  it('reads the figures as numbers and "None" as null', () => {
    expect(parseOverview(overview)).toMatchObject({ name: 'Apple Inc', pe: 33.1, peg: null, dividendYield: 0.0044, roe: 1.57, high52: 260.1, source: 'Alpha Vantage' });
  });
  it('is null for an unknown ticker and an error for throttling', () => {
    expect(parseOverview({})).toBeNull();
    expect(() => parseOverview({ Information: 'Our standard API rate limit is 25 requests per day.' })).toThrow(/rate limit/);
  });
});

describe('UsFundamentalsService', () => {
  it('fetches once and answers from the cache after that', async () => {
    const store = new Map<string, string>();
    let calls = 0;
    const service = new UsFundamentalsService({ fetch: () => { calls++; return Promise.resolve(parseOverview(overview)); } },
      { get: k => Promise.resolve(store.get(k) ?? null), set: (k, v) => { store.set(k, v); return Promise.resolve(); } }, () => Date.parse('2026-11-14T00:00:00Z'));
    const signal = new AbortController().signal;
    expect(await service.get('NASDAQ:AAPL', signal)).toMatchObject({ symbol: 'NASDAQ:AAPL', pe: 33.1, fetchedAt: '2026-11-14T00:00:00.000Z' });
    await service.get('NASDAQ:AAPL', signal);
    expect(calls).toBe(1);
  });
});
