import { describe, expect, it, vi } from 'vitest';
import { Universes } from './universes';
import type { StoredConstituents, UniverseStore } from './ports/universe-store';

const NOW = new Date('2026-11-12T10:00:00Z');
const members = (...syms: string[]) => syms.map(s => ({ id: `NSE:${s}`, name: `${s} Ltd` }));

function setup(opts: { stored?: StoredConstituents | null; fetch?: () => Promise<Array<{ id: string; name: string }>>; priced?: (id: string) => boolean; watch?: string[] } = {}) {
  let stored = opts.stored ?? null;
  const save = vi.fn((_i: string, v: StoredConstituents) => { stored = v; return Promise.resolve(); });
  const store: UniverseStore = {
    get: () => Promise.resolve(stored),
    save: save,
    pricedAmong: ids => Promise.resolve(new Set(ids.filter(opts.priced ?? (() => true)))),
  };
  const fetch = vi.fn(opts.fetch ?? (() => Promise.resolve(members('AAA', 'BBB', 'ZZZ'))));
  const universes = new Universes({ store, fetcher: { fetch }, watchlists: { get: () => Promise.resolve({ items: opts.watch ?? ['NSE:AAA', 'FX:EURUSD', 'NSE:GONE'] }) },
    fallback: { index: 'nifty50', date: '2026-11-08', ids: ['NSE:RELIANCE', 'NSE:TCS'] }, clock: () => NOW });
  return { universes, saved: save, fetch };
}

describe('Universes', () => {
  it('fetches an empty index, stores it, and drops unknown symbols with a count in the note', async () => {
    const { universes, saved, fetch } = setup({ priced: id => id !== 'NSE:ZZZ' });
    expect(await universes.members('nifty500', 'u1')).toEqual([{ symbol: 'NSE:AAA', name: 'AAA Ltd' }, { symbol: 'NSE:BBB', name: 'BBB Ltd' }]);
    expect(fetch).toHaveBeenCalledWith('nifty500', expect.any(AbortSignal));
    expect(saved).toHaveBeenCalledWith('nifty500', expect.objectContaining({ listDate: '2026-11-12' }), 'nse-indices');
    const info = (await universes.list()).find(u => u.id === 'nifty500');
    expect(info).toEqual({ id: 'nifty500', name: 'NIFTY 500', count: 2, note: '1 of 3 dropped: not in the instrument master or no price feed' });
  });

  it('uses a fresh stored list without fetching', async () => {
    const { universes, fetch } = setup({ stored: { members: members('AAA'), listDate: '2026-11-10', fetchedAt: '2026-11-10T06:00:00Z' } });
    expect(await universes.members('nifty100', 'u1')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the stale stored list and says so when the refetch fails', async () => {
    const { universes } = setup({ stored: { members: members('AAA'), listDate: '2026-10-20', fetchedAt: '2026-10-20T06:00:00Z' }, fetch: () => Promise.reject(new Error('down')) });
    expect((await universes.list()).find(u => u.id === 'nifty100')).toMatchObject({ count: 1, note: 'list of 2026-10-20; refresh failed' });
  });

  it('falls back to the built-in NIFTY 50 list when nothing is stored and the fetch fails; other indices are empty with a note', async () => {
    const { universes } = setup({ fetch: () => Promise.reject(new Error('down')) });
    expect((await universes.members('nifty50', 'u1')).map(m => m.symbol)).toEqual(['NSE:RELIANCE', 'NSE:TCS']);
    const list = await universes.list();
    expect(list.find(u => u.id === 'nifty50')?.note).toBe('built-in list of 2026-11-08; the live list could not be fetched');
    expect(list.find(u => u.id === 'nifty500')).toMatchObject({ count: 0, note: 'constituent list not fetched yet' });
  });

  it('counts only curated members that exist, and notes the rest', async () => {
    const { universes } = setup({ priced: id => id.startsWith('FX:EUR') || id.startsWith('FX:GBP') });
    const majors = await universes.members('forex-majors', 'u1');
    expect(majors.map(m => m.symbol)).toEqual(['FX:EURUSD', 'FX:GBPUSD']);
    expect((await universes.list()).find(u => u.id === 'forex-majors')).toMatchObject({ count: 2, note: '5 of 7 dropped: not in the instrument master or no price feed' });
  });

  it('returns the user watchlist limited to priced instruments', async () => {
    const { universes } = setup({ priced: id => id !== 'NSE:GONE' });
    expect((await universes.members('watchlist', 'u1')).map(m => m.symbol)).toEqual(['NSE:AAA', 'FX:EURUSD']);
  });

  it('refresh stores all three indices and survives one failing; throws when all fail', async () => {
    let n = 0;
    const partial = setup({ fetch: () => (++n === 2 ? Promise.reject(new Error('x')) : Promise.resolve(members('AAA'))) });
    expect(await partial.universes.refresh(new AbortController().signal)).toEqual({ nifty50: 1, nifty500: 1 });
    const none = setup({ fetch: () => Promise.reject(new Error('down')) });
    await expect(none.universes.refresh(new AbortController().signal)).rejects.toThrow('down');
  });
});
