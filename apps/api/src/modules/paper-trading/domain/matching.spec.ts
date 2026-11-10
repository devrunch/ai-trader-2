import { describe, expect, it } from 'vitest';
import { matchOrder, slipped, type PriceBar, type WorkingOrder } from './matching';

const T = 1_800_000_000_000;
const bar = (minute: number, open: number, high: number, low: number, close: number): PriceBar => ({ time: T + minute * 60_000, open, high, low, close });
const order = (patch: Partial<WorkingOrder>): WorkingOrder => ({
  side: 'buy', type: 'limit', limitPrice: null, triggerPrice: null, triggered: false, placedAt: T + 30_000, tick: 0.05, slippageRate: 0, ...patch,
});

describe('order matching FR-PT-2', () => {
  it('fills a market order at the open of the first bar after placement, with adverse slippage', () => {
    const result = matchOrder(order({ type: 'market', slippageRate: 0.001 }), [bar(0, 99, 101, 98, 100), bar(1, 100, 102, 99, 101)]);
    expect(result).toEqual({ kind: 'fill', price: 100.1, slippage: 0.1, at: T + 60_000 });
  });

  it('uses only the close of the bar the order was placed in', () => {
    const limit = order({ limitPrice: 99 });
    expect(matchOrder(limit, [bar(0, 99, 101, 98, 100)])).toEqual({ kind: 'none', triggered: false });
    expect(matchOrder(limit, [bar(0, 101, 101, 98, 98.5)])).toEqual({ kind: 'fill', price: 98.5, slippage: 0, at: T + 30_000 });
  });

  it('fills a buy limit at the limit when the low crosses it, and at the open when it opens below', () => {
    const limit = order({ limitPrice: 99 });
    expect(matchOrder(limit, [bar(1, 100, 100, 98.5, 99.5)])).toMatchObject({ kind: 'fill', price: 99 });
    expect(matchOrder(limit, [bar(1, 97, 98, 96, 97)])).toMatchObject({ kind: 'fill', price: 97 });
  });

  it('fills a sell limit when the high reaches it', () => {
    expect(matchOrder(order({ side: 'sell', limitPrice: 105 }), [bar(1, 100, 104.95, 99, 100), bar(2, 101, 106, 100, 104)]))
      .toEqual({ kind: 'fill', price: 105, slippage: 0, at: T + 120_000 });
  });

  it('fills a sell stop that the price gaps through at the next price, not the stop', () => {
    const stop = order({ side: 'sell', type: 'stop', triggerPrice: 100, slippageRate: 0.001 });
    expect(matchOrder(stop, [bar(1, 95, 96, 94, 95.5)])).toEqual({ kind: 'fill', price: 94.9, slippage: 0.1, at: T + 60_000 });
    expect(matchOrder(stop, [bar(1, 102, 102, 99.5, 100.5)])).toMatchObject({ kind: 'fill', price: 99.9 });
  });

  it('fills a buy stop when the high reaches the trigger', () => {
    expect(matchOrder(order({ type: 'stop', triggerPrice: 110 }), [bar(1, 105, 110, 104, 109)])).toMatchObject({ kind: 'fill', price: 110 });
    expect(matchOrder(order({ type: 'stop', triggerPrice: 110 }), [bar(1, 105, 109.95, 104, 109)])).toEqual({ kind: 'none', triggered: false });
  });

  it('fills a triggered stop-limit inside its limit and leaves a gapped one working as a limit', () => {
    const stopLimit = order({ type: 'stop_limit', triggerPrice: 110, limitPrice: 111 });
    expect(matchOrder(stopLimit, [bar(1, 105, 112, 104, 111)])).toMatchObject({ kind: 'fill', price: 110 });
    expect(matchOrder(stopLimit, [bar(1, 113, 114, 112, 113)])).toEqual({ kind: 'none', triggered: true });
    expect(matchOrder(stopLimit, [bar(1, 113, 114, 112, 113), bar(2, 112, 112, 110.5, 111)])).toMatchObject({ kind: 'fill', price: 111, at: T + 120_000 });
  });

  it('evaluates an already triggered stop-limit as a limit', () => {
    expect(matchOrder(order({ type: 'stop_limit', triggerPrice: 110, limitPrice: 111, triggered: true }), [bar(1, 112, 112, 110, 111)]))
      .toMatchObject({ kind: 'fill', price: 111 });
  });

  it('ignores bars before the order was placed', () => {
    expect(matchOrder(order({ limitPrice: 99 }), [bar(-1, 90, 90, 90, 90)])).toEqual({ kind: 'none', triggered: false });
  });

  it('rounds slipped prices to the tick away from the trader', () => {
    expect(slipped('buy', 100.01, 0.0003, 0.05)).toBe(100.05);
    expect(slipped('sell', 100.04, 0.0003, 0.05)).toBe(100);
    expect(slipped('buy', 100, 0, 0.05)).toBe(100);
  });
});
