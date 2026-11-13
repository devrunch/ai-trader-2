import { describe, expect, it } from 'vitest';
import { buildDepth } from './depth';

const level = (price: number, quantity: number, orders: number | null = 1) => ({ price, quantity, orders });
const base = { instrumentId: 'NSE:TEST', at: 1000, source: 'kite', levels: '5' as const };

describe('buildDepth', () => {
  it('computes spread, spread percent, totals and imbalance from the levels', () => {
    const depth = buildDepth({ ...base, bids: [level(99.5, 300), level(99.4, 100)], asks: [level(100.5, 100), level(100.6, 100)] });
    expect(depth.spread).toBe(1);
    expect(depth.spreadPct).toBe(1); // 1 / mid 100
    expect(depth.totalBidQty).toBe(400);
    expect(depth.totalAskQty).toBe(200);
    expect(depth.imbalance).toBe(0.33333333); // (400 - 200) / 600
  });
  it('drops empty exchange slots (price 0) and keeps at most five levels', () => {
    const bids = [1, 2, 3, 4, 5, 6].map(i => level(100 - i, 10));
    const depth = buildDepth({ ...base, bids: [...bids, level(0, 0, 0)], asks: [level(101, 5), level(0, 0, 0)] });
    expect(depth.bids).toHaveLength(5);
    expect(depth.asks).toEqual([level(101, 5)]);
  });
  it('returns null spread and imbalance when a side is empty or quantities are absent', () => {
    expect(buildDepth({ ...base, bids: [level(10, 5)], asks: [] })).toMatchObject({ spread: null, spreadPct: null, imbalance: 1 });
    expect(buildDepth({ ...base, levels: '1', bids: [level(10, 0, null)], asks: [level(10.5, 0, null)] }))
      .toMatchObject({ spread: 0.5, imbalance: null, totalBidQty: 0 });
  });
  it('avoids float noise in the spread', () => {
    expect(buildDepth({ ...base, bids: [level(0.1, 1)], asks: [level(0.3, 1)] }).spread).toBe(0.2);
  });
});
