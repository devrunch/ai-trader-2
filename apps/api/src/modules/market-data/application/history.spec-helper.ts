import { vi } from 'vitest';
import type { CandleStore } from './ports/candle-store';
import type { MarketDataProvider } from './ports/market-data-provider';
import type { HistoryInstruments } from './ports/history-instruments';

export const historyBar = { time: Date.parse('2026-11-09T03:45:00Z'), open: 10, high: 12, low: 9, close: 11, volume: 4 };
export const historySignal = () => new AbortController().signal;
export function historyFixture() {
  const store = {
    upsert1m: vi.fn<CandleStore['upsert1m']>().mockResolvedValue({ written: 1, repaired: 0 }),
    upsert1d: vi.fn<CandleStore['upsert1d']>().mockResolvedValue({ written: 1, repaired: 0 }),
    range1m: vi.fn<CandleStore['range1m']>().mockResolvedValue([]),
    range1d: vi.fn<CandleStore['range1d']>().mockResolvedValue([]),
    earliest: vi.fn<CandleStore['earliest']>().mockResolvedValue(null),
  };
  const instruments = {
    getMapping: vi.fn<HistoryInstruments['getMapping']>().mockResolvedValue({ providerSymbol: 'TEST', providerToken: '1/256', volumeType: 'real' }),
    held: vi.fn<HistoryInstruments['held']>().mockResolvedValue(['NSE:TEST']),
  };
  const history = vi.fn<MarketDataProvider['history']>().mockResolvedValue({ ok: true, data: [historyBar] });
  const provider: MarketDataProvider = { name: 'kite', history };
  return { store, instruments, history, providers: new Map([['kite', provider]]) };
}
