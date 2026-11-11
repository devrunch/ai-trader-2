import { describe, expect, it } from 'vitest';
import { PaperAccountSchema, PaperOrderSchema, PaperPlaceOrderRequestSchema } from './paper.js';

const order = {
  id: 'o1', clientOrderId: 'c1', instrumentId: 'NSE:INFY', currency: 'INR', side: 'buy', type: 'limit', product: 'MIS', quantity: 10,
  limitPrice: 1500, triggerPrice: null, stopLoss: null, target: null, status: 'open', triggered: false,
  rejectReason: null, closeReason: null, parentOrderId: null, fillPrice: null, placedAt: 1, expiresAt: 2, filledAt: null, updatedAt: 1,
};

describe('paper trading contracts (FR-PT-1, FR-PT-3)', () => {
  it('accepts a limit order request and rejects unknown fields', () => {
    const request = { clientOrderId: 'web-1', instrumentId: 'NSE:INFY', side: 'buy', type: 'limit', product: 'MIS', quantity: 10, limitPrice: 1500 };
    expect(PaperPlaceOrderRequestSchema.parse(request)).toEqual(request);
    expect(PaperPlaceOrderRequestSchema.safeParse({ ...request, broker: 'kite' }).success).toBe(false);
  });

  it('rejects fractional quantities and client ids with spaces', () => {
    const base = { clientOrderId: 'a', instrumentId: 'NSE:INFY', side: 'sell', type: 'market', product: 'CNC' };
    expect(PaperPlaceOrderRequestSchema.safeParse({ ...base, quantity: 1.5 }).success).toBe(false);
    expect(PaperPlaceOrderRequestSchema.safeParse({ ...base, quantity: 1, clientOrderId: 'a b' }).success).toBe(false);
  });

  it('validates order and account responses strictly', () => {
    expect(PaperOrderSchema.safeParse(order).success).toBe(true);
    expect(PaperOrderSchema.safeParse({ ...order, rejectReason: 'OTHER' }).success).toBe(false);
    const account = { id: 'a', currency: 'INR', initialCash: 1e6, cash: 1e6, usedMargin: 0, available: 1e6, realisedPnl: 0, charges: 0 };
    expect(PaperAccountSchema.safeParse(account).success).toBe(true);
    expect(PaperAccountSchema.safeParse({ ...account, currency: 'USD' }).success).toBe(true);
    expect(PaperAccountSchema.safeParse({ ...account, currency: 'usd' }).success).toBe(false);
  });
});
