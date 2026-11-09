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
  // The session before Monday 9 Nov 2026 is the Muhurat special session on Sunday 8 Nov (18:00-19:00 IST).
  expect(f.store.range1m).toHaveBeenCalledWith('NSE:TEST', Date.parse('2026-11-08T12:30:00Z'), Date.parse('2026-11-08T13:30:00Z'), expect.any(AbortSignal));
});
