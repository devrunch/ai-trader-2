import { beforeEach, expect, it } from 'vitest';
import { MiniSearchIndex } from './minisearch-index';
import { POPULAR_INSTRUMENTS } from './popular-instruments';
import { instrument } from '../application/instruments.spec-helper';
import type { Instrument } from '../domain';
import { DerivSource, KiteSource } from './sources/index';
import { clock, fixtureText, signal, silentSourceLogger } from './sources/source-fixtures.spec-helper';

// FR-SY-6: every type, statuses, canonical punctuation and aliases.
const defaults = ['NSE:NIFTY', 'NSE:BANKNIFTY', 'BSE:SENSEX', 'OANDA:XAUUSD', 'FX:EURUSD', 'NASDAQ:AAPL', 'NSE:RELIANCE'];
const fixtures: Instrument[] = defaults.map(id => instrument(id));
fixtures[0] = instrument('NSE:NIFTY', { type: 'index', aliases: ['NIFTY 50'] });
fixtures[6] = instrument('NSE:RELIANCE', { isin: 'INE002A01018' });
fixtures.push(instrument('NSE:ARE&M'), instrument('BSE:BSE SENSEX SIXTY 65:35'),
  instrument('NFO:NIFTY261126C24000', { type: 'option', aliases: ['nifty26nov24000ce'] }));
for (const type of ['stock', 'index', 'futures', 'option', 'forex', 'metal', 'commodity', 'etf', 'bond'] as const) {
  for (const status of ['active', 'suspended', 'expired', 'delisted'] as const) {
    fixtures.push(instrument(`NSE:RELIANCE${type}${status}`, { type, status, description: 'Reliance' }));
  }
}
let index: MiniSearchIndex;
beforeEach(() => { index = new MiniSearchIndex(); index.rebuild(fixtures); });
const search = (q: string) => index.search(q, { limit: 20 }).map(i => i.id);
it('search handles awkward queries', () => {
  for (const q of ['', 'n', 'nifty 50', 'ARE&M', 'INE002A01018', 'relianse', 'BSE SENSEX SIXTY 65:35', 'nifty26nov24000ce']) expect(Array.isArray(search(q))).toBe(true);
  expect(search('relianse').slice(0, 3)).toContain('NSE:RELIANCE');
  expect(search('nifty 50')[0]).toBe('NSE:NIFTY');
  expect(search('nifty26nov24000ce')).toContain('NFO:NIFTY261126C24000');
  expect(search('ARE&M')).toContain('NSE:ARE&M');
  expect(search('INE002A01018')[0]).toBe('NSE:RELIANCE');
  expect(search('INE002A0101')).toEqual([]);
});
it('filters by exchange and type', () => {
  expect(index.search('reliance', { limit: 50, exchange: 'NSE', type: 'option' })).toHaveLength(4);
  expect(index.search('reliance', { limit: 50, exchange: 'BSE' })).toEqual([]);
});
it('ranks NSE:RELIANCE above its futures and options for "reliance"', () => { expect(search('reliance')[0]).toBe('NSE:RELIANCE'); });
it('an exact canonical id ranks first', () => { expect(search('NSE:RELIANCEoptionexpired')[0]).toBe('NSE:RELIANCEoptionexpired'); });
it('empty query returns the popular defaults that exist', () => { expect(search('').slice(0, 7)).toEqual(defaults); });
it('rebuild is atomic', () => {
  const old = search('reliance');
  const next = [instrument('NASDAQ:NEW')];
  let rebuilding = true;
  Object.defineProperty(next[0], 'description', { get() { if (rebuilding) expect(search('reliance')).toEqual(old); return 'New'; } });
  index.rebuild(next);
  rebuilding = false;
  expect(search('reliance')).toEqual([]);
  expect(search('new')).toEqual(['NASDAQ:NEW']);
});
it('answers within 100 ms over 100k instruments', () => {
  index.rebuild([...fixtures, ...Array.from({ length: 100000 - fixtures.length }, (_, n) => instrument(`NSE:SYMBOL${String(n)}`, { description: `Company ${String(n)}` }))]);
  const timings: number[] = [];
  for (let n = 0; n < 200; n++) {
    const start = performance.now();
    search(['s', 'n', 'reliance', 'relianse', 'nifty 50', 'SYMBOL123', 'company 987', '', 'INE002A01018'][n % 9] ?? '');
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  process.stdout.write(`FR-SY-6 CACHED 100k/200 mixed queries p50=${String(timings[99]?.toFixed(2))}ms p95=${String(timings[189]?.toFixed(2))}ms\n`);
  expect(timings[189]).toBeLessThan(100);
}, 60000);

it('suggest delegates to the ranked search results', () => {
  expect(index.suggest('relianse', 3).map(String)).toEqual(search('relianse').slice(0, 3));
});
it('preserves the published snapshot when a rebuild fails', () => {
  const old = search('reliance');
  expect(() => { index.rebuild([instrument('NSE:DUP'), instrument('NSE:DUP')]); }).toThrow();
  expect(search('reliance')).toEqual(old);
});
it('applies ranking ties and filters before limiting', () => {
  index.rebuild([
    instrument('NSE:A', { description: 'Same', type: 'stock', status: 'expired' }),
    instrument('NSE:B', { description: 'Same', type: 'bond' }),
    instrument('NSE:C', { description: 'Same', type: 'stock' }),
    instrument('NSE:D', { description: 'Same', type: 'stock' }),
    instrument('NSE:LONG', { description: 'Same', type: 'stock' }),
    instrument('BSE:OTHER', { aliases: ['same'] }),
  ]);
  expect(search('same')).toEqual(['BSE:OTHER', 'NSE:C', 'NSE:D', 'NSE:LONG', 'NSE:B', 'NSE:A']);
  expect(index.search('same', { exchange: 'NSE', type: 'bond', limit: 1 }).map(i => i.id)).toEqual(['NSE:B']);
  expect(index.search('', { exchange: 'BSE', limit: 1 }).map(i => i.id)).toEqual(['BSE:OTHER']);
});

// FR-SY-6: manager review ranking policy, verified independently of insertion order.
it('ranking prefers NSE over BSE for the same ticker', () => {
  index.rebuild([instrument('BSE:ARE&M'), instrument('NSE:ARE&M'), instrument('BSE:RELIANCE'), instrument('NSE:RELIANCE')]);
  expect(search('ARE&M').slice(0, 2)).toEqual(['NSE:ARE&M', 'BSE:ARE&M']);
  expect(search('relianse').slice(0, 2)).toEqual(['NSE:RELIANCE', 'BSE:RELIANCE']);
});
it('popular instruments rank first when they match', () => {
  expect(POPULAR_INSTRUMENTS).toHaveLength(69);
  expect(new Set(POPULAR_INSTRUMENTS).size).toBe(69);
  expect(POPULAR_INSTRUMENTS.slice(19).filter(id => id.startsWith('NSE:'))).toHaveLength(50);
  index.rebuild([instrument('NSE:NSEINDEXNIFTY50USD', { type: 'index' }),
    instrument('NSE:NIFTY', { type: 'index', aliases: ['NIFTY 50'] }),
    instrument('NSE:BANKNIFTY', { type: 'index', aliases: ['NIFTY BANK'] }),
    instrument('NSE:NIFTY1!', { type: 'futures', description: 'NIFTY continuous' })]);
  expect(search('n').slice(0, 3)).toEqual(['NSE:NIFTY', 'NSE:NIFTY1!', 'NSE:BANKNIFTY']);
  expect(search('nifty').slice(0, 3)).toEqual(['NSE:NIFTY', 'NSE:NIFTY1!', 'NSE:BANKNIFTY']);
  expect(search('NSE:NSEINDEXNIFTY50USD')[0]).toBe('NSE:NSEINDEXNIFTY50USD');
});
it('ticker prefix beats description match', () => {
  index.rebuild([instrument('NSE:ZZZ', { type: 'index', description: 'Copper' }),
    instrument('NSE:COPPERLONG', { type: 'stock' }), instrument('NSE:COPPER', { type: 'commodity' })]);
  expect(search('cop')).toEqual(['NSE:COPPER', 'NSE:COPPERLONG', 'NSE:ZZZ']);
});
it('metal and continuous aliases make gold find MCX:GOLD1! and OANDA:XAUUSD', async () => {
  const metals = await new DerivSource().fetch(signal());
  const kite = await new KiteSource(fixtureText, clock, silentSourceLogger).fetch(signal());
  expect(metals.instruments.find(i => String(i.id) === 'OANDA:XAUUSD')?.aliases).toEqual(['GOLD', 'GOLD SPOT']);
  expect(metals.instruments.find(i => String(i.id) === 'OANDA:XAGUSD')?.aliases).toEqual(['SILVER', 'SILVER SPOT']);
  expect(metals.instruments.find(i => String(i.id) === 'OANDA:XPTUSD')?.aliases).toEqual(['PLATINUM']);
  expect(metals.instruments.find(i => String(i.id) === 'OANDA:XPDUSD')?.aliases).toEqual(['PALLADIUM']);
  expect(kite.instruments.find(i => String(i.id) === 'MCX:GOLD1!')?.aliases).toEqual(['GOLD']);
  index.rebuild([...metals.instruments, ...kite.instruments, instrument('NYSE:GOLD')]);
  expect(search('gold').slice(0, 2)).toEqual(['MCX:GOLD1!', 'OANDA:XAUUSD']);
});
it('uncached p95 under 100 ms over 100k unique queries', () => {
  index.rebuild([...fixtures, ...Array.from({ length: 100000 - fixtures.length }, (_, n) => instrument(`NSE:SYMBOL${String(n)}`, { description: `Company ${String(n)}` }))]);
  const queries = Array.from({ length: 200 }, (_, n) => {
    const suffix = String(n);
    return n % 3 === 0 ? `company ${suffix}` : n % 3 === 1 ? `symbol ${suffix}` : `symbol${suffix}`;
  });
  expect(new Set(queries).size).toBe(200);
  const timings = queries.map(q => {
    const start = performance.now();
    expect(index.search(q, { limit: 20 }).length).toBeGreaterThan(0);
    return performance.now() - start;
  }).sort((a, b) => a - b);
  process.stdout.write(`FR-SY-6 UNCACHED 100k/200 unique queries p50=${String(timings[99]?.toFixed(2))}ms p95=${String(timings[189]?.toFixed(2))}ms\n`);
  expect(timings[189]).toBeLessThan(100);
}, 120000);

it('exchange preference preserves other tickers relevance and prefers US listing venues', () => {
  index.rebuild([instrument('NYSE:ALPHA', { description: 'Alpha' }), instrument('NASDAQ:ALPHA', { description: 'Alpha' }),
    instrument('NSE:ALPHABET', { description: 'Alpha' })]);
  expect(search('alpha').slice(0, 2)).toEqual(['NASDAQ:ALPHA', 'NYSE:ALPHA']);
  index.rebuild([instrument('NSE:COPPER', { type: 'stock' }), instrument('MCX:COPPER', { type: 'commodity' })]);
  expect(search('copper').slice(0, 2)).toEqual(['MCX:COPPER', 'NSE:COPPER']);
});
