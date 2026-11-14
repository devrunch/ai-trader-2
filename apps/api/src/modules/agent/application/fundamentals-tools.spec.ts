import type { FundamentalsResponse } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { buildFundamentalsTools } from './fundamentals-tools';

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const deps = { limiter: { take: vi.fn().mockResolvedValue(true) }, audit: vi.fn() };
const record: FundamentalsResponse = { symbol: 'NSE:INFY', name: 'Infosys', consolidated: true, source: 'screener-in', fetchedAt: '2026-03-10T00:00:00.000Z', reportDate: '2025-12-31', stale: false,
  ratios: { marketCap: 1, pe: 24, bookValue: 1, roe: 1, roce: 1, dividendYield: 1, debtToEquity: 0, salesGrowth3y: null, salesGrowth5y: null, profitGrowth3y: null, profitGrowth5y: null, promoterHolding: 14, fiiHolding: null, diiHolding: null },
  quarterly: [], annual: [], shareholding: { period: null, promoter: 14, fii: null, dii: null, public: null } };
const noUs = () => undefined;

describe('getFundamentals tool', () => {
  it('returns ratios with source, fetchedAt and reportDate for an NSE stock', async () => {
    const get = vi.fn().mockResolvedValue(record);
    const tool = buildFundamentalsTools({ get, us: noUs }, deps)[0];
    const out = await tool?.call(ctx, { symbol: 'NSE:INFY' });
    expect(out).toMatchObject({ ok: true, data: { available: true, market: 'india', source: 'screener-in', fetchedAt: '2026-03-10T00:00:00.000Z', reportDate: '2025-12-31', stale: false, ratios: { pe: 24 } } });
    expect(get).toHaveBeenCalledWith('NSE:INFY', undefined);
  });

  it('answers with the current figures when there is no record at the asked time', async () => {
    const get = vi.fn().mockImplementation((_s: string, asOf?: number) => Promise.resolve(asOf === undefined ? record : null));
    const out = await buildFundamentalsTools({ get, us: noUs }, deps)[0]?.call(ctx, { symbol: 'NSE:INFY', asOf: '2026-01-01T00:00:00Z' });
    expect(get).toHaveBeenCalledWith('NSE:INFY', Date.parse('2026-01-01T00:00:00Z'));
    expect(out).toMatchObject({ ok: true, data: { available: true, note: 'no record as of the asked time; these are the current figures', ratios: { pe: 24 } } });
  });

  it('answers a US stock from the US source', async () => {
    const out = await buildFundamentalsTools({ get: vi.fn(), us: s => (s === 'NASDAQ:AAPL' ? Promise.resolve({ symbol: s, pe: 33.1 }) : undefined) }, deps)[0]?.call(ctx, { symbol: 'NASDAQ:AAPL' });
    expect(out).toMatchObject({ ok: true, data: { available: true, market: 'us', pe: 33.1 } });
  });

  it('says what fundamentals cover for an instrument that is not a company, without calling the service', async () => {
    const get = vi.fn<() => Promise<FundamentalsResponse | null>>();
    const out = await buildFundamentalsTools({ get, us: noUs }, deps)[0]?.call(ctx, { symbol: 'FX:EURUSD' });
    expect(out).toMatchObject({ ok: true, data: { available: false } });
    expect(JSON.stringify(out)).toContain('an index, currency, commodity or coin has none');
    expect(get).not.toHaveBeenCalled();
  });
});
