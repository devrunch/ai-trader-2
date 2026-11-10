import { beforeEach, describe, expect, it } from 'vitest';
import type { PaperPlaceOrderRequest } from '@aitrader/contracts';
import type { PriceBar } from '../domain/matching';
import { MatchOpenOrders } from './match-open-orders';
import { PlaceOrder } from './place-order';
import { FakeMarket, fakeDeps, INFY, MemoryPaperStore, NOW } from './paper.spec-helper';

const minute = (n: number) => Math.floor(NOW / 60_000) * 60_000 + n * 60_000;
const bar = (n: number, open: number, high: number, low: number, close: number): PriceBar => ({ time: minute(n), open, high, low, close });
const request = (patch: Partial<PaperPlaceOrderRequest>): PaperPlaceOrderRequest => ({
  clientOrderId: 'c-1', instrumentId: INFY.id, side: 'buy', type: 'limit', product: 'MIS', quantity: 10, limitPrice: 1490, ...patch,
});

describe('MatchOpenOrders FR-PT-2, NFR-RB-4', () => {
  let store: MemoryPaperStore; let market: FakeMarket; let place: PlaceOrder; let match: MatchOpenOrders; const clock = { now: NOW };
  beforeEach(() => {
    store = new MemoryPaperStore(); market = new FakeMarket(); clock.now = NOW;
    market.quotes.set(INFY.id, { price: 1500, at: NOW - 30_000 });
    const deps = fakeDeps(clock);
    place = new PlaceOrder(store, market, deps); match = new MatchOpenOrders(store, market, deps);
  });

  it('fills a resting limit when a later bar crosses it, exactly once across repeated runs', async () => {
    const order = await place.execute('user-1', request({}));
    market.bars.set(INFY.id, [bar(1, 1498, 1499, 1488, 1492)]);
    clock.now = minute(2);
    expect(await match.execute()).toEqual({ filled: 1, triggered: 0 });
    expect(await match.execute()).toEqual({ filled: 0, triggered: 0 });
    expect(store.state.orders.find(o => o.id === order.id)).toMatchObject({ status: 'filled', fillPrice: 1490, filledAt: minute(1) });
    expect(store.state.fills).toHaveLength(1);
    expect(store.state.positions[0]).toMatchObject({ quantity: 10, averagePrice: 1490 });
  });

  it('runs concurrently without filling twice', async () => {
    await place.execute('user-1', request({}));
    market.bars.set(INFY.id, [bar(1, 1498, 1499, 1488, 1492)]);
    const results = await Promise.all([match.execute(), match.execute(), match.execute()]);
    expect(results.reduce((sum, r) => sum + r.filled, 0)).toBe(1);
    expect(store.state.fills).toHaveLength(1);
  });

  it('fills a sell stop the price gaps through at the open', async () => {
    await place.execute('user-1', request({ clientOrderId: 'entry', type: 'market', limitPrice: undefined }));
    await place.execute('user-1', request({ side: 'sell', type: 'stop', limitPrice: undefined, triggerPrice: 1450 }));
    market.bars.set(INFY.id, [bar(1, 1440, 1442, 1430, 1435)]);
    await match.execute();
    expect(store.state.orders.find(o => o.clientOrderId === 'c-1')).toMatchObject({ status: 'filled', fillPrice: 1440 });
    expect(store.state.positions[0]).toMatchObject({ quantity: 0, realisedPnl: -600 });
  });

  it('records a stop-limit trigger and fills it later as a limit', async () => {
    await place.execute('user-1', request({ type: 'stop_limit', triggerPrice: 1510, limitPrice: 1512 }));
    market.bars.set(INFY.id, [bar(1, 1515, 1516, 1514, 1515)]);
    expect(await match.execute()).toEqual({ filled: 0, triggered: 1 });
    expect(store.state.orders[0]?.triggered).toBe(true);
    market.bars.set(INFY.id, [bar(1, 1515, 1516, 1514, 1515), bar(2, 1514, 1514, 1511, 1512)]);
    expect(await match.execute()).toEqual({ filled: 1, triggered: 0 });
    expect(store.state.orders[0]).toMatchObject({ status: 'filled', fillPrice: 1512 });
  });

  it('creates OCO exits when an entry fills, and one exit filling cancels the other', async () => {
    await place.execute('user-1', request({ type: 'market', limitPrice: undefined, stopLoss: 1480, target: 1520 }));
    const exits = store.state.orders.filter(o => o.parentOrderId !== null);
    expect(exits.map(o => [o.clientOrderId, o.side, o.type, o.triggerPrice ?? o.limitPrice])).toEqual([['c-1#sl', 'sell', 'stop', 1480], ['c-1#tp', 'sell', 'limit', 1520]]);
    market.bars.set(INFY.id, [bar(1, 1505, 1521, 1504, 1518)]);
    await match.execute();
    expect(store.state.orders.find(o => o.clientOrderId === 'c-1#tp')).toMatchObject({ status: 'filled', fillPrice: 1520 });
    expect(store.state.orders.find(o => o.clientOrderId === 'c-1#sl')).toMatchObject({ status: 'cancelled', closeReason: 'OCO' });
    expect(store.state.positions[0]).toMatchObject({ quantity: 0, realisedPnl: 200 });
  });

  it('ignores bars at or after an order expires', async () => {
    const order = await place.execute('user-1', request({}));
    market.bars.set(INFY.id, [{ ...bar(1, 1480, 1480, 1480, 1480), time: order.expiresAt }]);
    expect(await match.execute()).toEqual({ filled: 0, triggered: 0 });
  });

  it('keeps feeds open for instruments with open orders and releases them after', async () => {
    await place.execute('user-1', request({}));
    await match.execute();
    market.bars.set(INFY.id, [bar(1, 1480, 1480, 1480, 1480)]);
    await match.execute();
    await match.execute();
    expect(market.watched).toEqual([[INFY.id], [INFY.id], []]);
  });

  it('fills other instruments when one instrument fails, then reports the failure', async () => {
    await place.execute('user-1', request({}));
    market.instruments.set('NSE:TCS', { ...INFY, id: 'NSE:TCS' });
    market.quotes.set('NSE:TCS', { price: 4000, at: NOW });
    await place.execute('user-1', request({ clientOrderId: 'c-2', instrumentId: 'NSE:TCS', limitPrice: 3990 }));
    market.bars.set(INFY.id, [bar(1, 1480, 1480, 1480, 1480)]);
    market.barsSince = (id, since) => id === 'NSE:TCS' ? Promise.reject(new Error('provider down')) : FakeMarket.prototype.barsSince.call(market, id, since);
    await expect(match.execute()).rejects.toThrow('1 instrument');
    expect(store.state.orders.find(o => o.clientOrderId === 'c-1')?.status).toBe('filled');
  });
});
