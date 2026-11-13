import { aggregate } from '../domain/aggregate';
import type { Bar } from '../domain/bar';
import { calendarForInstrument, type MarketCalendar } from '../domain/calendar';
import { addDaysToDate, dateAt } from '../domain/calendars/time';
import { isBarClosed, staleReason } from '../domain/stored-freshness';
import type { StoredBarsReader } from './ports/stored-bars-reader';
import { sessionCache } from './session-cache';

export type ScanInterval = '15' | '60' | '1D';
export interface StoredBarSeries { bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number | null }>; newestTime: number | null; stale: string | null }

const DAY = 86_400_000;
/** Instruments per query: bounds the rows held at once (500 x 1500 one-minute rows would not fit comfortably). */
const CHUNK = 150;

/**
 * Closed bars from the stored candle store only, for scans: daily from the 1D table, 15m and 1h aggregated from 1-minute bars on the session grid.
 * Never calls a vendor; the series says `stale` when stored data is too old to trust.
 */
export class StoredBars {
  constructor(private readonly reader: StoredBarsReader, private readonly clock: () => number = Date.now) {}

  async latest(symbols: string[], interval: ScanInterval, limit: number, signal?: AbortSignal): Promise<Map<string, StoredBarSeries>> {
    const now = this.clock();
    const out = new Map<string, StoredBarSeries>();
    const known: Array<{ id: string; cal: MarketCalendar }> = [];
    for (const id of new Set(symbols)) {
      try { known.push({ id, cal: sessionCache(calendarForInstrument(id)) }); }
      catch { out.set(id, { bars: [], newestTime: null, stale: 'no market calendar for this instrument' }); }
    }
    const raw = new Map<string, Bar[]>();
    for (let i = 0; i < known.length; i += CHUNK) {
      signal?.throwIfAborted();
      const ids = known.slice(i, i + CHUNK).map(k => k.id);
      const rows = interval === '1D'
        ? await this.reader.range1d(ids, addDaysToDate(dateAt(now, 'UTC'), -Math.ceil(limit * 1.6 + 10)), addDaysToDate(dateAt(now, 'UTC'), 2), signal)
        // Calendar days that hold `limit` bars even for the shortest session (~360 min), with slack for holidays.
        : await this.reader.range1m(ids, now - (Math.ceil(limit * Number(interval) / 360 * 1.6) + 4) * DAY, now + 60_000, signal);
      for (const [id, bars] of rows) raw.set(id, bars);
    }
    for (const { id, cal } of known) {
      const stored = raw.get(id) ?? [];
      const all = interval === '1D' ? stored : aggregate(stored, interval, cal);
      // Only the newest bars can still be forming.
      let end = all.length;
      while (end > 0 && !isBarClosed(all[end - 1]?.time ?? 0, interval, now, cal)) end--;
      const bars = all.slice(Math.max(0, end - limit), end);
      const newestTime = bars.at(-1)?.time ?? null;
      out.set(id, { bars: bars.map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume })), newestTime, stale: staleReason(newestTime, interval, now, cal) });
    }
    return out;
  }
}
