import { describe, expect, it, vi } from 'vitest';
import type { Depth } from '@aitrader/contracts';
import { buildDepthTools } from './depth-tools';

const ctx = { userId: 'u1', conversationId: '7d9f0a2e-0000-4000-8000-000000000001', turnId: 'turn-abcdef12' };
const deps = { limiter: { take: () => Promise.resolve(true) }, audit: () => undefined };
const depth: Depth = { instrumentId: 'NSE:INFY', at: 1000, source: 'kite', levels: '5', bids: [{ price: 99, quantity: 10, orders: 1 }],
  asks: [{ price: 101, quantity: 30, orders: 2 }], spread: 2, spreadPct: 2, totalBidQty: 10, totalAskQty: 30, imbalance: -0.5 };

describe('getDepth tool', () => {
  it('returns levels, spread, imbalance, source and the depth time', async () => {
    const read = vi.fn().mockResolvedValue({ depth, unavailable: null });
    const tool = buildDepthTools({ read }, deps).find(t => t.name === 'getDepth');
    expect(await tool?.call(ctx, { symbol: 'NSE:INFY' })).toEqual({ ok: true, data: { symbol: 'NSE:INFY', available: true, source: 'kite', asOf: 1000, levels: '5',
      bids: depth.bids, asks: depth.asks, spread: 2, spreadPct: 2, totalBidQty: 10, totalAskQty: 30, imbalance: -0.5 } });
    expect(read).toHaveBeenCalledWith('NSE:INFY');
  });
  it('gives the plain reason when there is no book', async () => {
    const tool = buildDepthTools({ read: () => Promise.resolve({ depth: null, unavailable: 'Market closed' }) }, deps)[0];
    expect(await tool?.call(ctx, { symbol: 'NSE:INFY' })).toEqual({ ok: true, data: { symbol: 'NSE:INFY', available: false, reason: 'Market closed' } });
  });
  it('rejects a non-canonical symbol and says it is live-only', async () => {
    const tool = buildDepthTools({ read: vi.fn() }, deps)[0];
    expect(await tool?.call(ctx, { symbol: 'infy' })).toMatchObject({ ok: false, reason: 'INVALID_INPUT' });
    expect(tool?.description).toContain('not available in a time-machine replay');
  });
});
