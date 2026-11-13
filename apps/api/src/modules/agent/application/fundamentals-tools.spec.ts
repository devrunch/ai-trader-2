import type { FundamentalsResponse } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { buildFundamentalsTools } from './fundamentals-tools';

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const deps = { limiter: { take: vi.fn().mockResolvedValue(true) }, audit: vi.fn() };
const record: FundamentalsResponse = { symbol: 'NSE:INFY', name: 'Infosys', consolidated: true, source: 'screener-in', fetchedAt: '2026-03-10T00:00:00.000Z', reportDate: '2025-12-31', stale: false,
  ratios: { marketCap: 1, pe: 24, bookValue: 1, roe: 1, roce: 1, dividendYield: 1, debtToEquity: 0, salesGrowth3y: null, salesGrowth5y: null, profitGrowth3y: null, profitGrowth5y: null, promoterHolding: 14, fiiHolding: null, diiHolding: null },
  quarterly: [], annual: [], shareholding: { period: null, promoter: 14, fii: null, dii: null, public: null } };

describe('getFundamentals tool', () => {
  it('returns ratios with source, fetchedAt and reportDate for an NSE stock', async () => {
    const get = vi.fn().mockResolvedValue(record);
    const tool = buildFundamentalsTools({ get }, deps)[0];
    const out = await tool?.call(ctx, { symbol: 'NSE:INFY' });
    expect(out).toMatchObject({ ok: true, data: { available: true, source: 'screener-in', fetchedAt: '2026-03-10T00:00:00.000Z', reportDate: '2025-12-31', stale: false, ratios: { pe: 24 } } });
    expect(get).toHaveBeenCalledWith('NSE:INFY', undefined);
  });

  it('passes asOf through as epoch milliseconds', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const out = await buildFundamentalsTools({ get }, deps)[0]?.call(ctx, { symbol: 'NSE:INFY', asOf: '2026-01-01T00:00:00Z' });
    expect(get).toHaveBeenCalledWith('NSE:INFY', Date.parse('2026-01-01T00:00:00Z'));
    expect(out).toMatchObject({ ok: true, data: { available: false } });
  });

  it('says clearly it is not available for non-NSE-stock instruments, without calling the service', async () => {
    const get = vi.fn<() => Promise<FundamentalsResponse | null>>();
    const out = await buildFundamentalsTools({ get }, deps)[0]?.call(ctx, { symbol: 'FX:EURUSD' });
    expect(out).toMatchObject({ ok: true, data: { available: false } });
    expect(JSON.stringify(out)).toContain('not available for non-NSE-stock instruments');
    expect(get).not.toHaveBeenCalled();
  });
});
