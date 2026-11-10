import { beforeEach, describe, expect, it } from 'vitest';
import type { PaperPlaceOrderRequest } from '@aitrader/contracts';
import { PlaceOrder } from './place-order';
import { SquareOff } from './square-off';
import { FakeMarket, fakeDeps, INFY, MemoryPaperStore, NOW, SESSION, SQUARE_OFF } from './paper.spec-helper';

const request = (patch: Partial<PaperPlaceOrderRequest> = {}): PaperPlaceOrderRequest => ({
  clientOrderId: 'c-1', instrumentId: INFY.id, side: 'buy', type: 'market', product: 'MIS', quantity: 10, ...patch,
});

describe('SquareOff FR-PT-5, NFR-RB-5, E22, E25', () => {
  let store: MemoryPaperStore; let market: FakeMarket; let place: PlaceOrder; let squareOff: SquareOff; const clock = { now: NOW };
  let matched = 0; const logs: string[] = []; let deps: ReturnType<typeof fakeDeps>;
  beforeEach(async () => {
    store = new MemoryPaperStore(); market = new FakeMarket(); clock.now = NOW; matched = 0; logs.length = 0;
    market.quotes.set(INFY.id, { price: 1500, at: NOW - 30_000 });
    deps = fakeDeps(clock);
    place = new PlaceOrder(store, market, deps);
    squareOff = new SquareOff(store, market, deps, { execute: () => { matched++; return Promise.resolve({ filled: 0, triggered: 0 }); } },
      message => { logs.push(message); });
    await place.execute('user-1', request());
    await place.execute('user-1', request({ clientOrderId: 'cnc', product: 'CNC', quantity: 5 }));
    await place.execute('user-1', request({ clientOrderId: 'mis-limit', type: 'limit', limitPrice: 1450 }));
    await place.execute('user-1', request({ clientOrderId: 'cnc-limit', product: 'CNC', type: 'limit', limitPrice: 1450 }));
  });

  it('does nothing before the square-off time', async () => {
    clock.now = SQUARE_OFF - 1;
    expect(await squareOff.execute()).toEqual({ expired: 0, squaredOff: 0 });
  });

  it('expires MIS orders and flattens MIS positions at 15:20 IST, leaving delivery alone', async () => {
    clock.now = SQUARE_OFF + 5_000;
    market.quotes.set(INFY.id, { price: 1510, at: SQUARE_OFF });
    expect(await squareOff.execute()).toEqual({ expired: 1, squaredOff: 1 });
    expect(matched).toBe(1);
    expect(store.state.orders.find(o => o.clientOrderId === 'mis-limit')).toMatchObject({ status: 'expired', closeReason: 'SQUARE_OFF' });
    expect(store.state.orders.find(o => o.clientOrderId === 'cnc-limit')?.status).toBe('open');
    const exit = store.state.orders.find(o => o.clientOrderId.startsWith('squareoff#'));
    expect(exit).toMatchObject({ side: 'sell', type: 'market', product: 'MIS', quantity: 10, status: 'filled', fillPrice: 1510 });
    expect(store.state.positions.find(p => p.product === 'MIS')).toMatchObject({ quantity: 0, realisedPnl: 100, squareOffAt: null });
    expect(store.state.positions.find(p => p.product === 'CNC')).toMatchObject({ quantity: 5 });
  });

  it('is safe to run twice, and catches up after a missed window', async () => {
    clock.now = SESSION.close + 3_600_000;
    await squareOff.execute();
    expect(await squareOff.execute()).toEqual({ expired: 0, squaredOff: 0 });
    expect(store.state.orders.filter(o => o.clientOrderId.startsWith('squareoff#'))).toHaveLength(1);
    expect(store.state.orders.find(o => o.clientOrderId === 'cnc-limit')).toMatchObject({ status: 'expired', closeReason: 'SESSION_END' });
  });

  it('squares off at the average price when there is no price at all, and says so', async () => {
    clock.now = SQUARE_OFF;
    market.quotes.delete(INFY.id);
    await squareOff.execute();
    expect(store.state.positions.find(p => p.product === 'MIS')).toMatchObject({ quantity: 0, realisedPnl: 0 });
    expect(logs).toContain('paper square-off had no price; used the average price');
  });

  it('still squares off when the matching pass fails', async () => {
    squareOff = new SquareOff(store, market, deps, { execute: () => Promise.reject(new Error('down')) }, message => { logs.push(message); });
    clock.now = SQUARE_OFF;
    expect(await squareOff.execute()).toMatchObject({ squaredOff: 1 });
    expect(logs).toContain('paper matching before square-off failed');
  });
});
