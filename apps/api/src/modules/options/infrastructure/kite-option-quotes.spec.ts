import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { KiteOptionQuotes, parseKiteQuotes } from './kite-option-quotes';

const fixture: unknown = JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'kite', 'quote-nifty.json'), 'utf8'));

describe('Kite option quotes', () => {
  it('parses last price, open interest and volume from a recorded quote reply', () => {
    const quotes = parseKiteQuotes(fixture);
    expect(quotes.get('NFO:NIFTY2611324500CE')).toEqual({ ltp: 98.5, oi: 2_100_000, volume: 1_250_000 });
    expect(quotes.get('NFO:NIFTY2611324500PE')).toEqual({ ltp: 71.2, oi: 2_600_000, volume: 1_100_000 });
    expect(quotes.get('NSE:NIFTY 50')).toEqual({ ltp: 24512.4, oi: null, volume: null });
  });
  it('reads a zero last price as no price', () => {
    expect(parseKiteQuotes(fixture).get('NFO:NIFTY2611324600CE')).toEqual({ ltp: null, oi: 0, volume: 0 });
  });
  it('rejects a reply of the wrong shape instead of returning nothing', () => {
    expect(() => parseKiteQuotes({ status: 'error' })).toThrow();
    expect(() => parseKiteQuotes(null)).toThrow();
  });
  it('batches 200 symbols per call and takes one token each', async () => {
    const getQuote = vi.fn((batch: string[]) => Promise.resolve(Object.fromEntries(batch.map(s => [s, { last_price: 1 }]))));
    const take = vi.fn(() => Promise.resolve());
    const source = new KiteOptionQuotes({ getAccessToken: () => Promise.resolve('t') }, { take }, () => ({ setAccessToken: vi.fn(), getQuote }));
    await source.quote(Array.from({ length: 1001 }, (_, i) => `NFO:X${String(i)}`), new AbortController().signal);
    expect(getQuote.mock.calls.map(c => c[0].length)).toEqual([200, 200, 200, 200, 200, 1]);
    expect(take).toHaveBeenCalledTimes(6);
  });
});
