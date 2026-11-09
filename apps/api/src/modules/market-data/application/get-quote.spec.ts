import { expect, it, vi } from 'vitest';
import { GetQuote } from './get-quote';
import { MarketDataService } from './market-data.service';
import { marketFixture, quoteBar } from './market-data.spec-helper';
import { historyFixture } from './history.spec-helper';
import type { FormingBarStore } from './ports/forming-bar-store';

function fixture() {
  const f = marketFixture(); const { store } = historyFixture();
  const forming = { get: vi.fn<FormingBarStore['get']>().mockResolvedValue(null) };
  store.range1m.mockResolvedValue([quoteBar]);
  return { ...f, store, forming, quote: new GetQuote(new MarketDataService(f.resolve, f.read, f.feeds), store, forming) };
}
it('uses the forming bar when present (FR-UI-8)', async () => {
  const f = fixture(); f.forming.get.mockResolvedValue({ bar: { ...quoteBar, close: 120 }, seq: null, lastCumVolume: null });
  expect(await f.quote.execute('NSE:TEST')).toMatchObject({ price: 120, at: quoteBar.time });
});
it('falls back to the last stored close (FR-MD-1)', async () => {
  const f = fixture(); expect(await f.quote.execute('NSE:TEST')).toMatchObject({ price: 110, at: quoteBar.time });
});
it('change is against the previous session close (FR-UI-7)', async () => {
  const f = fixture();
  f.store.range1m.mockImplementation((_id, from, to) => Promise.resolve(from <= quoteBar.time && to > quoteBar.time ? [quoteBar] : [{ ...quoteBar, time: Date.parse('2026-11-06T09:59:00Z'), close: 100 }]));
  expect(await f.quote.execute('NSE:TEST')).toMatchObject({ price: 110, change: 10, changePct: 10 });
  // The session before Monday 9 Nov 2026 is the Muhurat special session on Sunday 8 Nov (14:20-15:30 IST, from data).
  expect(f.store.range1m).toHaveBeenCalledWith('NSE:TEST', Date.parse('2026-11-08T08:50:00Z'), Date.parse('2026-11-08T10:00:00Z'), expect.any(AbortSignal));
});
it('a previous session with no stored bars falls back to the one before it', async () => {
  const f = fixture();
  const friday = { ...quoteBar, time: Date.parse('2026-11-06T09:59:00Z'), close: 100 };
  f.store.range1m.mockImplementation((_id, from, to) => Promise.resolve(
    from <= quoteBar.time && to > quoteBar.time ? [quoteBar] : from <= friday.time && to > friday.time ? [friday] : []));
  expect(await f.quote.execute('NSE:TEST')).toMatchObject({ price: 110, change: 10, changePct: 10 });
});

function official(stored: { close: number; forDate: string } | null, fetched: number | null = null) {
  const prev = { get: vi.fn().mockResolvedValue(stored), set: vi.fn().mockResolvedValue(undefined) };
  const source = { fetch: vi.fn().mockResolvedValue(fetched) };
  const f = fixture();
  const quote = new GetQuote(new MarketDataService(f.resolve, f.read, f.feeds), f.store, f.forming, { store: prev, source }, () => quoteBar.time);
  return { ...f, prev, source, quote };
}
it('uses Zerodha’s official previous close for the quote’s session', async () => {
  const f = official({ close: 105, forDate: '2026-11-09' });
  expect(await f.quote.execute('NSE:TEST')).toMatchObject({ price: 110, change: 5 });
  expect(f.source.fetch).not.toHaveBeenCalled();
});
it('fetches the official close when none is stored for today and saves it', async () => {
  const f = official(null, 100);
  expect(await f.quote.execute('NSE:TEST')).toMatchObject({ change: 10, changePct: 10 });
  expect(f.prev.set).toHaveBeenCalledWith('NSE:TEST', 100, '2026-11-09', expect.any(AbortSignal));
});
it('a close saved for another session is not used', async () => {
  const f = official({ close: 50, forDate: '2026-11-06' }, null);
  f.store.range1m.mockImplementation((_id, from, to) => Promise.resolve(from <= quoteBar.time && to > quoteBar.time ? [quoteBar] : [{ ...quoteBar, time: Date.parse('2026-11-06T09:59:00Z'), close: 100 }]));
  expect(await f.quote.execute('NSE:TEST')).toMatchObject({ change: 10 });
});
