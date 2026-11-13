import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { Watchlists, type WatchlistStore } from './watchlists';

class MemoryStore implements WatchlistStore {
  rows = new Map<string, string[]>();
  get(userId: string) { return Promise.resolve(this.rows.get(userId) ?? null); }
  save(userId: string, items: string[]) { this.rows.set(userId, [...items]); return Promise.resolve(); }
  allSymbols() { return Promise.resolve([...new Set([...this.rows.values()].flat())]); }
}

const known = new Map([['NSE:INFY', 'NSE:INFY'], ['nasdaq:aapl', 'NASDAQ:AAPL'], ['NASDAQ:AAPL', 'NASDAQ:AAPL'], ['MCX:GOLD1!', 'MCX:GOLD1!']]);
const deps = {
  defaults: () => ['NSE:NIFTY', 'NSE:RELIANCE'],
  canonical: (s: string) => { const id = known.get(s); return id ? Promise.resolve(id) : Promise.reject(new NotFoundError('Instrument not found', { id: s })); },
};

describe('watchlists', () => {
  let store: MemoryStore; let lists: Watchlists;
  beforeEach(() => { store = new MemoryStore(); lists = new Watchlists(store, deps); });

  it('shows the defaults until the first edit, which starts from them', async () => {
    expect(await lists.get('u1')).toEqual({ items: ['NSE:NIFTY', 'NSE:RELIANCE'], custom: false });
    expect(await lists.add('u1', 'nasdaq:aapl')).toEqual({ items: ['NSE:NIFTY', 'NSE:RELIANCE', 'NASDAQ:AAPL'], custom: true });
    expect(await lists.add('u1', 'NASDAQ:AAPL')).toMatchObject({ items: ['NSE:NIFTY', 'NSE:RELIANCE', 'NASDAQ:AAPL'] });
  });

  it('removing everything leaves an empty list, not the defaults', async () => {
    await lists.remove('u1', 'NSE:NIFTY');
    expect(await lists.remove('u1', 'NSE:RELIANCE')).toEqual({ items: [], custom: true });
    expect(await lists.get('u1')).toEqual({ items: [], custom: true });
  });

  it('replaces in the given order, resolving only new symbols and dropping repeats', async () => {
    expect((await lists.replace('u1', ['MCX:GOLD1!', 'NSE:RELIANCE', 'MCX:GOLD1!'])).items).toEqual(['MCX:GOLD1!', 'NSE:RELIANCE']);
    await expect(lists.replace('u1', ['NSE:NOPE'])).rejects.toBeInstanceOf(NotFoundError);
    expect((await lists.get('u1')).items).toEqual(['MCX:GOLD1!', 'NSE:RELIANCE']);
  });

  it('lists every watched symbol once across users', async () => {
    await lists.replace('u1', ['NSE:INFY']); await lists.replace('u2', ['NSE:INFY', 'NASDAQ:AAPL']);
    expect((await lists.allSymbols()).sort()).toEqual(['NASDAQ:AAPL', 'NSE:INFY']);
  });

  it('caps the list at 100', async () => {
    store.rows.set('u1', Array.from({ length: 100 }, (_, i) => `NSE:S${String(i)}`));
    await expect(lists.add('u1', 'NSE:INFY')).rejects.toBeInstanceOf(ValidationError);
  });
});
