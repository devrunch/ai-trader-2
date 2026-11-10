import { describe, expect, it } from 'vitest';
import { applyFill, FLAT, unrealisedPnl } from './position';

describe('position netting FR-PT-1', () => {
  it('averages the price of fills on the same side', () => {
    const first = applyFill(FLAT, 'buy', 10, 100);
    const second = applyFill(first.position, 'buy', 30, 104);
    expect(first).toEqual({ position: { quantity: 10, averagePrice: 100, realisedPnl: 0 }, realised: 0 });
    expect(second.position).toEqual({ quantity: 40, averagePrice: 103, realisedPnl: 0 });
  });

  it('realises P&L on a partial close and keeps the average', () => {
    expect(applyFill({ quantity: 40, averagePrice: 103, realisedPnl: 0 }, 'sell', 10, 110))
      .toEqual({ position: { quantity: 30, averagePrice: 103, realisedPnl: 70 }, realised: 70 });
  });

  it('flips through zero and opens the remainder at the fill price', () => {
    expect(applyFill({ quantity: 10, averagePrice: 100, realisedPnl: 5 }, 'sell', 25, 90))
      .toEqual({ position: { quantity: -15, averagePrice: 90, realisedPnl: -95 }, realised: -100 });
  });

  it('realises a short covered lower as profit and resets a flat average to zero', () => {
    expect(applyFill({ quantity: -15, averagePrice: 90, realisedPnl: 0 }, 'buy', 15, 80))
      .toEqual({ position: { quantity: 0, averagePrice: 0, realisedPnl: 150 }, realised: 150 });
  });

  it('marks open quantity to the last price', () => {
    expect(unrealisedPnl({ quantity: -15, averagePrice: 90 }, 92)).toBe(-30);
    expect(unrealisedPnl({ quantity: 3, averagePrice: 10.1 }, 10.2)).toBe(0.3);
  });
});
