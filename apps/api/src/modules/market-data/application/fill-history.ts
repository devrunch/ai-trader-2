import { calendarFor } from '../domain/calendar';
import { dateAt } from '../domain/calendars/time';
import { mergeRepair } from '../domain/repair';
import type { CandleStore } from './ports/candle-store';
import type { HistoryInstruments } from './ports/history-instruments';
import type { MarketDataProvider, ProviderResult } from './ports/market-data-provider';

type Counts = { written: number; repaired: number };
export class FillHistory {
  private readonly flights = new Map<string, Promise<ProviderResult<Counts>>>();
  constructor(private readonly store: CandleStore, private readonly instruments: HistoryInstruments,
    private readonly providers: ReadonlyMap<string, MarketDataProvider>) {}

  execute(instrumentId: string, res: '1m' | '1d', from: number, to: number, signal: AbortSignal): Promise<ProviderResult<Counts>> {
    signal.throwIfAborted();
    const key = JSON.stringify([instrumentId, res, from, to]);
    const existing = this.flights.get(key);
    if (existing) return existing;
    const flight = this.fill(instrumentId, res, from, to, signal).finally(() => { this.flights.delete(key); });
    this.flights.set(key, flight);
    return flight;
  }

  private async fill(id: string, res: '1m' | '1d', from: number, to: number, signal: AbortSignal): Promise<ProviderResult<Counts>> {
    if (id.endsWith('1!')) return { ok: false, reason: 'UNSUPPORTED', detail: 'continuous history arrives in P2-8' };
    const exchange = id.split(':')[0] ?? '';
    if (!['NSE', 'BSE', 'MCX', 'NFO'].includes(exchange)) return { ok: false, reason: 'UNSUPPORTED' };
    const mapping = await this.instruments.getMapping(id, 'kite', signal);
    const provider = this.providers.get('kite');
    if (!mapping || !provider) return { ok: false, reason: 'UNSUPPORTED' };
    const result = await provider.history(mapping, res, from, to, signal);
    if (!result.ok) return result;
    const timezone = calendarFor(exchange).timezone;
    const live = res === '1m' ? await this.store.range1m(id, from, to, signal)
      : await this.store.range1d(id, dateAt(from, timezone), dateAt(to + 86400000, timezone), signal);
    const merged = mergeRepair(live, result.data);
    // Upsert only vendor timestamps; preserve live-only bars and their provenance.
    const times = new Set(result.data.map(bar => bar.time));
    const bars = merged.bars.filter(bar => times.has(bar.time));
    const data = res === '1m' ? await this.store.upsert1m(id, bars, 'kite', signal)
      : await this.store.upsert1d(id, bars, 'kite', signal);
    return { ok: true, data };
  }
}
