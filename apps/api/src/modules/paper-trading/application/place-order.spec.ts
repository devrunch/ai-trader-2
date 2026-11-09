import { beforeEach, describe, expect, it } from 'vitest';
import type { PaperPlaceOrderRequest } from '@aitrader/contracts';
import { ConflictError, ValidationError } from '../../../shared/errors';
import { chargesFor } from '../domain/cost-model';
import { PlaceOrder } from './place-order';
import { CancelOrder } from './cancel-order';
import { FakeMarket, fakeDeps, INFY, MemoryPaperStore, NIFTY_FUT, NOW, SESSION, SQUARE_OFF } from './paper.spec-helper';

const request = (patch: Partial<PaperPlaceOrderRequest> = {}): PaperPlaceOrderRequest => ({
  clientOrderId: 'c-1', instrumentId: INFY.id, side: 'buy', type: 'market', product: 'MIS', quantity: 10, ...patch,
});

describe('PlaceOrder FR-PT-1..4, FR-PT-6, NFR-RB-4', () => {
  let store: MemoryPaperStore; let market: FakeMarket; let place: PlaceOrder; const clock = { now: NOW };
  beforeEach(() => {
    store = new MemoryPaperStore(); market = new FakeMarket(); clock.now = NOW;
    market.quotes.set(INFY.id, { price: 1500, at: NOW - 30_000 });
    place = new PlaceOrder(store, market, fakeDeps(clock));
  });

  it('fills a market order at a fresh quote and books charges, position and cash', async () => {
    const order = await place.execute('user-1', request());
    const charges = chargesFor({ segment: 'equity', product: 'MIS', side: 'buy', exchange: 'NSE', price: 1500, quantity: 10 });
    expect(order).toMatchObject({ status: 'filled', fillPrice: 1500, filledAt: NOW, expiresAt: SQUARE_OFF });
    expect(store.state.fills).toEqual([expect.objectContaining({ orderId: order.id, price: 1500, quantity: 10, charges, realisedPnl: 0 })]);
    expect(store.state.positions).toEqual([expect.objectContaining({ instrumentId: INFY.id, product: 'MIS', quantity: 10, averagePrice: 1500, squareOffAt: SQUARE_OFF })]);
    expect(store.state.accounts[0]).toMatchObject({ cash: 1_000_000 - charges.total, charges: charges.total, realisedPnl: 0 });
  });

  it('leaves a market order working when the last quote is not fresh', async () => {
    market.quotes.set(INFY.id, { price: 1500, at: NOW - 10 * 60_000 });
    expect(await place.execute('user-1', request())).toMatchObject({ status: 'open', referencePrice: 1500 });
    expect(store.state.fills).toEqual([]);
  });

  it('stores a rejection with its reason and answers a retry with the same order', async () => {
    market.sessionWindow = null;
    const first = await place.execute('user-1', request());
    const retry = await place.execute('user-1', request());
    expect(first).toMatchObject({ status: 'rejected', rejectReason: 'MARKET_CLOSED' });
    expect(retry).toEqual(first);
    expect(store.state.orders).toHaveLength(1);
  });

  it('creates one order for concurrent duplicates of a clientOrderId', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => place.execute('user-1', request())));
    expect(new Set(results.map(o => o.id)).size).toBe(1);
    expect(store.state.orders).toHaveLength(1);
    expect(store.state.fills).toHaveLength(1);
  });

  it('refuses a clientOrderId reused with a different order', async () => {
    await place.execute('user-1', request());
    await expect(place.execute('user-1', request({ quantity: 11 }))).rejects.toBeInstanceOf(ConflictError);
  });

  it('keeps client ids per account', async () => {
    await place.execute('user-1', request());
    expect((await place.execute('user-2', request())).status).toBe('filled');
  });

  it('answers structural mistakes with a validation error and stores nothing', async () => {
    market.quotes.set(NIFTY_FUT.id, { price: 24000, at: NOW });
    await expect(place.execute('user-1', request({ instrumentId: NIFTY_FUT.id, quantity: 50 }))).rejects.toBeInstanceOf(ValidationError);
    expect(store.state.orders).toEqual([]);
  });

  it('rejects instruments paper trading does not cover', async () => {
    market.instruments.set('NSE:NIFTY', { ...INFY, id: 'NSE:NIFTY', type: 'index' });
    expect(await place.execute('user-1', request({ instrumentId: 'NSE:NIFTY' }))).toMatchObject({ status: 'rejected', rejectReason: 'INSTRUMENT_NOT_ALLOWED' });
  });

  it('rests a passive limit until its expiry: the square-off for MIS, the close otherwise', async () => {
    expect(await place.execute('user-1', request({ type: 'limit', limitPrice: 1490 }))).toMatchObject({ status: 'open', expiresAt: SQUARE_OFF });
    expect(await place.execute('user-1', request({ clientOrderId: 'c-2', type: 'limit', limitPrice: 1490, product: 'CNC' })))
      .toMatchObject({ status: 'open', expiresAt: SESSION.close });
  });

  it('fills a marketable limit at the better live price', async () => {
    expect(await place.execute('user-1', request({ type: 'limit', limitPrice: 1510 }))).toMatchObject({ status: 'filled', fillPrice: 1500 });
  });

  it('counts margin blocked by working orders', async () => {
    await place.execute('user-1', request({ clientOrderId: 'big', type: 'limit', limitPrice: 1490, product: 'CNC', quantity: 330 }));
    await place.execute('user-1', request({ clientOrderId: 'big-2', type: 'limit', limitPrice: 1490, product: 'CNC', quantity: 330 }));
    const third = await place.execute('user-1', request({ clientOrderId: 'big-3', type: 'limit', limitPrice: 1490, product: 'CNC', quantity: 330 }));
    expect(third).toMatchObject({ status: 'rejected', rejectReason: 'INSUFFICIENT_MARGIN' });
  });

  it('rejects when there is no price at all', async () => {
    market.quotes.delete(INFY.id);
    expect(await place.execute('user-1', request())).toMatchObject({ status: 'rejected', rejectReason: 'NO_PRICE' });
  });
});

describe('CancelOrder', () => {
  it('cancels an open order once and refuses to cancel it again', async () => {
    const store = new MemoryPaperStore(); const market = new FakeMarket(); const clock = { now: NOW }; const deps = fakeDeps(clock);
    market.quotes.set(INFY.id, { price: 1500, at: NOW });
    const order = await new PlaceOrder(store, market, deps).execute('user-1', request({ type: 'limit', limitPrice: 1490 }));
    const cancel = new CancelOrder(store, deps);
    expect(await cancel.execute('user-1', order.id)).toMatchObject({ status: 'cancelled', closeReason: 'USER' });
    await expect(cancel.execute('user-1', order.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(cancel.execute('user-2', order.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
