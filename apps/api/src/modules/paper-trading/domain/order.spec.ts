import { describe, expect, it } from 'vitest';
import { assertCancellable, InvalidOrderError, OrderStateError, validateOrder, type OrderInput } from './order';

const equity = { lotSize: 1, tick: 0.05 };
const base: OrderInput = { side: 'buy', type: 'limit', product: 'MIS', quantity: 10, limitPrice: 100 };
const reason = (input: OrderInput, instrument = equity, segment: 'equity' | 'futures' | 'options' = 'equity') => {
  try { validateOrder(input, instrument, segment); return null; }
  catch (error) { return error instanceof InvalidOrderError ? error.field : 'unexpected'; }
};

describe('order validation FR-PT-2', () => {
  it('accepts a well-formed limit order', () => { expect(reason(base)).toBeNull(); });

  it('requires the prices each order type uses and nothing else', () => {
    expect(reason({ ...base, type: 'market' })).toBe('limitPrice');
    expect(reason({ ...base, type: 'market', limitPrice: undefined })).toBeNull();
    expect(reason({ ...base, limitPrice: undefined })).toBe('limitPrice');
    expect(reason({ ...base, type: 'stop', limitPrice: undefined })).toBe('triggerPrice');
    expect(reason({ ...base, type: 'stop', triggerPrice: 101 })).toBe('limitPrice');
    expect(reason({ ...base, type: 'limit', triggerPrice: 101 })).toBe('triggerPrice');
    expect(reason({ ...base, type: 'stop_limit', triggerPrice: 99 })).toBeNull();
  });

  it('orders the stop-limit trigger and limit by side', () => {
    expect(reason({ ...base, type: 'stop_limit', triggerPrice: 101, limitPrice: 100 })).toBe('limitPrice');
    expect(reason({ ...base, side: 'sell', type: 'stop_limit', triggerPrice: 99, limitPrice: 100 })).toBe('limitPrice');
  });

  it('requires lot multiples and tick multiples', () => {
    expect(reason({ ...base, quantity: 70 }, { lotSize: 75, tick: 0.05 }, 'options')).toBe('quantity');
    expect(reason({ ...base, product: 'NRML', quantity: 150 }, { lotSize: 75, tick: 0.05 }, 'options')).toBeNull();
    expect(reason({ ...base, limitPrice: 100.03 })).toBe('limitPrice');
  });

  it('places the stop-loss and target on the right sides of the entry', () => {
    expect(reason({ ...base, stopLoss: 95, target: 110 })).toBeNull();
    expect(reason({ ...base, stopLoss: 101 })).toBe('stopLoss');
    expect(reason({ ...base, target: 99 })).toBe('target');
    expect(reason({ ...base, side: 'sell', stopLoss: 105, target: 90 })).toBeNull();
    expect(reason({ ...base, type: 'market', limitPrice: undefined, stopLoss: 110, target: 100 })).toBe('stopLoss');
  });

  it('allows each product only on its segment', () => {
    expect(reason({ ...base, product: 'NRML' })).toBe('product');
    expect(reason({ ...base, product: 'CNC', quantity: 75 }, { lotSize: 75, tick: 0.05 }, 'futures')).toBe('product');
  });
});

describe('order state machine', () => {
  it('cancels only open orders', () => {
    expect(() => { assertCancellable('open'); }).not.toThrow();
    for (const status of ['filled', 'cancelled', 'rejected', 'expired'] as const) {
      expect(() => { assertCancellable(status); }).toThrow(OrderStateError);
    }
  });
});
