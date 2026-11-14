import type { OptionChain, OptionsSummary } from '@aitrader/contracts';
import { describe, expect, it, vi } from 'vitest';
import { buildOptionsTools } from './options-tools';

const ctx = { userId: 'u1', conversationId: 'c1', turnId: 't1' };
const deps = { limiter: { take: vi.fn().mockResolvedValue(true) }, audit: vi.fn() };
const chain: OptionChain = { underlying: 'NIFTY', expiry: '2026-11-19', expiries: ['2026-11-19'], spot: 24510, atm: 24500, rows: [], source: 'kite', fetchedAt: '2026-11-13T10:00:00.000Z' };
const summary: OptionsSummary = { underlying: 'NIFTY', expiry: '2026-11-19', pcr: 1.2, maxPain: 24500, totalCeOi: 10, totalPeOi: 12, buildups: [], source: 'kite', fetchedAt: '2026-11-13T10:00:00.000Z' };
const tools = (port: Partial<Parameters<typeof buildOptionsTools>[0]>) => buildOptionsTools({ chain: () => Promise.resolve(null), summary: () => Promise.resolve(null), ...port }, deps);
const find = (list: ReturnType<typeof tools>, name: string) => list.find(t => t.name === name);

describe('options tools', () => {
  it('getOptionChain returns the chain with its source and passes the expiry, strikes and asOf through', async () => {
    const chainFn = vi.fn().mockResolvedValue(chain);
    const out = await find(tools({ chain: chainFn }), 'getOptionChain')?.call(ctx, { underlying: 'NIFTY', expiry: '2026-11-19', strikes: 5, asOf: '2026-11-13T10:00:00Z' });
    expect(out).toMatchObject({ ok: true, data: { available: true, atm: 24500, source: 'kite' } });
    expect(chainFn).toHaveBeenCalledWith('NIFTY', { expiry: '2026-11-19', strikes: 5, asOf: Date.parse('2026-11-13T10:00:00Z') }, expect.any(AbortSignal));
  });
  it('getOptionsSummary returns PCR and max pain', async () => {
    const out = await find(tools({ summary: () => Promise.resolve(summary) }), 'getOptionsSummary')?.call(ctx, { underlying: 'NIFTY' });
    expect(out).toMatchObject({ ok: true, data: { available: true, pcr: 1.2, maxPain: 24500 } });
  });
  it('says unavailable instead of failing when no snapshot exists at asOf', async () => {
    const out = await find(tools({}), 'getOptionChain')?.call(ctx, { underlying: 'NIFTY', asOf: '2026-01-01T00:00:00Z' });
    expect(out).toMatchObject({ ok: true, data: { available: false, source: 'kite option quotes' } });
  });
  it('rejects a symbol that is not an underlying ticker', async () => {
    const out = await find(tools({}), 'getOptionChain')?.call(ctx, { underlying: 'FX:EURUSD' });
    expect(out).toMatchObject({ ok: false });
  });
});
