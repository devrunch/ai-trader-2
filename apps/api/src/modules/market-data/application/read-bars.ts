import { ValidationError } from '../../../shared/errors';
import { InstrumentId } from '../../instruments/application/index';
import { aggregate } from '../domain/aggregate';
import { calendarFor } from '../domain/calendar';
import { bucketStart } from '../domain/grid';
import { dateAt, periodStart } from '../domain/calendars/time';
import { intervalMinutes, type Interval } from '../domain/interval';
import type { Bar } from '../domain/bar';
import type { CandleStore } from './ports/candle-store';
import type { FormingBarStore } from './ports/forming-bar-store';
import { sessionCache } from './session-cache';

export type BarsCursor = { before: number } | { since: number } | { latest: true };
export interface BarsPage { bars: Bar[]; nextBefore: number | null; complete: boolean }
const day = 86400000;
const date = (time: number) => new Date(time).toISOString().slice(0, 10);

export class ReadBars {
  constructor(private readonly store: CandleStore, private readonly forming: FormingBarStore,
    private readonly clock: () => number = Date.now) {}

  // Widen from a session-size estimate until enough buckets or the persisted boundary is reached.
  async execute(instrumentId: string, interval: Interval, cursor: BarsCursor, limit: number): Promise<BarsPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new ValidationError('Limit must be an integer from 1 to 5000');
    const id = InstrumentId.tryParse(instrumentId);
    if (!id) throw new ValidationError('Invalid instrument ID');
    let cal;
    try { cal = sessionCache(calendarFor(id.exchange)); } catch { throw new ValidationError('Unsupported exchange'); }
    const minutes = intervalMinutes(interval);
    const daily = minutes === null;
    const end = 'before' in cursor ? cursor.before : this.clock() + 1;
    const earliest = await this.store.earliest(instrumentId, daily);
    const live = 'before' in cursor ? null : await this.forming.get(instrumentId);
    const session = cal.sessionContaining(end - 1) ?? cal.sessionsOn(date(end)).at(0);
    const sessionMinutes = session ? (session.close - session.open) / 60000 : 375;
    let span = Math.max(day, Math.ceil(limit * (minutes ?? (interval === '1M' ? 31 * 375 : interval === '1W' ? 7 * 375 : 375)) / sessionMinutes * 1.6) * day);
    let from = 'since' in cursor ? cursor.since : end - span;
    let bars: Bar[];
    for (;;) {
      // Include the entire first bucket; filter output by the cursor after aggregation.
      const aligned = daily ? periodStart(dateAt(from, cal.timezone), interval, cal.timezone) : bucketStart(from, interval, cal) ?? from;
      const windowStart = daily ? Math.min(from, aligned) - day : Math.min(from, aligned);
      const raw = daily ? await this.store.range1d(instrumentId, dateAt(windowStart, cal.timezone), dateAt(end + day, cal.timezone))
        : await this.store.range1m(instrumentId, windowStart, end);
      const newest = raw.at(-1);
      if (live && live.bar.time < end && (!newest || live.bar.time > newest.time)) raw.push(live.bar);
      bars = interval === '1D' && !live ? raw : aggregate(raw, interval, cal);
      bars = bars.filter(b => b.time < end && (!('since' in cursor) || b.time >= cursor.since));
      if ('since' in cursor || (bars.length >= limit && newest !== undefined) || earliest === null || from <= earliest) break;
      span *= 2; from = end - span;
    }
    bars = 'since' in cursor ? bars.slice(0, limit) : bars.slice(-limit);
    return { bars, nextBefore: bars[0]?.time ?? null,
      complete: !(bars.length < limit && (earliest === null || earliest > from)) };
  }
}
