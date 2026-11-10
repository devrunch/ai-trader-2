import { describe, expect, it } from 'vitest';
import { PlaceOrder } from './place-order';
import { ReadPortfolio } from './read-portfolio';
import { FakeMarket, fakeDeps, INFY, MemoryPaperStore, NOW } from './paper.spec-helper';

describe('ReadPortfolio FR-PT-1, FR-PT-7', () => {
  const setup = async () => {
    const store = new MemoryPaperStore(); const market = new FakeMarket(); const deps = fakeDeps({ now: NOW });
    market.quotes.set(INFY.id, { price: 1500, at: NOW });
    const place = new PlaceOrder(store, market, deps);
    await place.execute('user-1', { clientOrderId: 'a', instrumentId: INFY.id, side: 'buy', type: 'market', product: 'MIS', quantity: 10 });
    await place.execute('user-1', { clientOrderId: 'b', instrumentId: INFY.id, side: 'buy', type: 'limit', product: 'CNC', quantity: 2, limitPrice: 1400 });
    return { store, market, read: new ReadPortfolio(store, market, deps) };
  };

  it('reports cash, margin in use and what is available', async () => {
    const { read, store } = await setup();
    const charges = store.state.accounts[0]?.charges ?? 0;
    expect(await read.account('user-1')).toEqual({ id: 'acct-1', currency: 'INR', initialCash: 1_000_000, cash: 1_000_000 - charges,
      usedMargin: 3000 + 2800, available: 1_000_000 - charges - 5800, realisedPnl: 0, charges });
  });

  it('marks positions to the last price and survives a missing quote', async () => {
    const { read, market } = await setup();
    market.quotes.set(INFY.id, { price: 1512.5, at: NOW });
    expect(await read.positions('user-1')).toEqual([expect.objectContaining({ instrumentId: INFY.id, quantity: 10, lastPrice: 1512.5, unrealisedPnl: 125 })]);
    market.quote = () => Promise.reject(new Error('down'));
    expect(await read.positions('user-1')).toEqual([expect.objectContaining({ lastPrice: null, unrealisedPnl: null })]);
  });

  it('lists orders newest first, open only on request, and fills', async () => {
    const { read } = await setup();
    expect((await read.orders('user-1', { openOnly: true, limit: 50 })).map(o => o.clientOrderId)).toEqual(['b']);
    expect(await read.orders('user-1', { openOnly: false, limit: 50 })).toHaveLength(2);
    expect(await read.fills('user-1', 50)).toEqual([expect.objectContaining({ price: 1500, quantity: 10 })]);
  });
});
