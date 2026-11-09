import { vi } from 'vitest';
import { InstrumentId, type ResolveInstrument } from '../../instruments/application/index';
import type { ReadBars } from './read-bars';
import type { FeedStateStore } from './ports/feed-state-store';

export const quoteBar = { time: Date.parse('2026-11-09T04:00:00Z'), open: 100, high: 115, low: 99, close: 110, volume: 10 };
export function marketFixture(id = 'NSE:TEST') {
  const parsed = InstrumentId.parse(id);
  const resolve = { execute: vi.fn<ResolveInstrument['execute']>().mockResolvedValue({ instrument: {
    id: parsed, exchange: parsed.exchange, ticker: parsed.ticker, description: 'Test', type: 'stock', currency: 'INR',
    timezone: 'Asia/Kolkata', session: '0915-1530', pricescale: 100, minmov: 1, lotSize: 1, hasIntraday: true,
    volumeType: 'real', status: 'active', aliases: [],
  } }) };
  const read = { execute: vi.fn<ReadBars['execute']>().mockResolvedValue({ bars: [quoteBar], nextBefore: quoteBar.time, complete: true, status: { ok: true } }) };
  const feeds = { get: vi.fn<FeedStateStore['get']>().mockResolvedValue({ state: 'unknown' }) };
  return { resolve, read, feeds };
}
