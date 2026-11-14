import { describe, expect, it } from 'vitest';
import { KiteDepthSnapshotSource } from './kite-depth-snapshot.source';

const signal = new AbortController().signal;
const make = (payload: unknown) => new KiteDepthSnapshotSource({ getAccessToken: () => Promise.resolve('t') },
  { getMapping: () => Promise.resolve({ providerSymbol: 'NSE:HDFCBANK' } as never) }, { take: () => Promise.resolve() },
  () => ({ setAccessToken: () => undefined, getQuote: () => Promise.resolve(payload) }), () => 1000);

describe('KiteDepthSnapshotSource', () => {
  it('builds the five-level book from /quote', async () => {
    const book = await make({ 'NSE:HDFCBANK': { timestamp: '2026-11-13T10:00:00Z', depth: {
      buy: [{ price: 803, quantity: 100, orders: 3 }, { price: 0, quantity: 0, orders: 0 }], sell: [{ price: 803.5, quantity: 50, orders: 2 }] } } }).fetch('NSE:HDFCBANK', signal);
    expect(book).toMatchObject({ instrumentId: 'NSE:HDFCBANK', source: 'kite', bids: [{ price: 803, quantity: 100 }], asks: [{ price: 803.5, quantity: 50 }], spread: 0.5 });
  });
  it('is null when the quote carries no book', async () => {
    expect(await make({ 'NSE:HDFCBANK': { depth: { buy: [], sell: [] } } }).fetch('NSE:HDFCBANK', signal)).toBeNull();
  });
});
