import { ValidationError } from '../../../shared/errors';
import { InstrumentId } from '../../instruments/application/index';
import { aggregate } from '../domain/aggregate';
import { calendarForInstrument } from '../domain/calendar';
import { bucketStart } from '../domain/grid';
import { tailGap } from '../domain/tail-gap';
import { dateAt, periodStart } from '../domain/calendars/time';
import { intervalMinutes, type Interval } from '../domain/interval';
import type { Bar } from '../domain/bar';
import type { CandleStore } from './ports/candle-store';
import type { FormingBarStore } from './ports/forming-bar-store';
import { sessionCache } from './session-cache';
import type { FillHistory } from './fill-history';
import type { ProviderReason, ProviderResult } from './ports/market-data-provider';

export type BarsCursor = { before: number } | { since: number } | { latest: true };
export interface BarsPage {
  bars: Bar[]; nextBefore: number | null; complete: boolean;
  status: { ok: true } | { ok: false; reason: ProviderReason; detail?: string };
}
const day = 86400000;
const TAIL_COOLDOWN_MS = 60_000;
const date = (time: number) => new Date(time).toISOString().slice(0, 10);

export class ReadBars {
  private readonly tailCheckedAt = new Map<string, number>();
  /** Tail ends the vendor had nothing for (e.g. the closing-auction minutes); not asked again until new minutes are due. */
  private readonly tailSettled = new Map<string, number>();
  constructor(private readonly store: CandleStore, private readonly forming: FormingBarStore,
    private readonly clock: () => number = Date.now, private readonly fill?: Pick<FillHistory, 'execute'>) {}

  async execute(instrumentId: string, interval: Interval, cursor: BarsCursor, limit: number,
    signal: AbortSignal = new AbortController().signal): Promise<BarsPage | Extract<ProviderResult<never>, { ok: false }>> {
    signal.throwIfAborted();
    const tail = 'before' in cursor ? null : await this.fillTail(instrumentId, interval, signal);
    const first = await this.read(instrumentId, interval, cursor, limit, signal);
    if (first.page.complete) {
      if (!first.page.bars.length) return { ok: false, reason: 'NO_DATA' };
      return tail ? { ...first.page, status: { ok: false, reason: tail.reason, ...(tail.detail === undefined ? {} : { detail: tail.detail }) } } : first.page;
    }
    const res = intervalMinutes(interval) === null ? '1d' : '1m';
    const earliest = await this.store.earliest(instrumentId, res === '1d', signal);
    const to = earliest === null ? first.end : Math.min(first.end, earliest);
    const result = this.fill ? await this.fill.execute(instrumentId, res, first.from, to, signal)
      : { ok: false, reason: 'UNSUPPORTED' } satisfies ProviderResult<never>;
    const { page } = await this.read(instrumentId, interval, cursor, limit, signal);
    if (!result.ok) return page.bars.length ? { ...page, status: { ok: false, reason: result.reason,
      ...(result.detail === undefined ? {} : { detail: result.detail }) } } : result;
    return page.bars.length ? page : { ok: false, reason: 'NO_DATA' };
  }

  /**
   * Repairs minutes missing after the newest stored bar (a feed outage, a process restart) before reading,
   * so the newest page never shows a hole. At most once a minute per instrument.
   */
  private async fillTail(instrumentId: string, interval: Interval, signal: AbortSignal): Promise<Extract<ProviderResult<unknown>, { ok: false }> | null> {
    if (!this.fill || intervalMinutes(interval) === null) return null;
    const id = InstrumentId.tryParse(instrumentId);
    if (!id) return null;
    let cal;
    try { cal = calendarForInstrument(instrumentId); } catch { return null; }
    const now = this.clock();
    if (now - (this.tailCheckedAt.get(instrumentId) ?? -Infinity) < TAIL_COOLDOWN_MS) return null;
    this.tailCheckedAt.set(instrumentId, now);
    const gap = tailGap(cal, (await this.store.latest1m(instrumentId, signal)) ?? undefined, now);
    if (!gap || this.tailSettled.get(instrumentId) === gap.to) return null;
    const result = await this.fill.execute(instrumentId, '1m', gap.from, gap.to, signal);
    const empty = result.ok ? result.data.written === 0 : result.reason === 'NO_DATA';
    if (empty) this.tailSettled.set(instrumentId, gap.to);
    return result.ok || empty ? null : result;
  }

  // Widen from a session-size estimate until enough buckets or the persisted boundary is reached.
  private async read(instrumentId: string, interval: Interval, cursor: BarsCursor, limit: number, signal: AbortSignal):
    Promise<{ page: BarsPage; from: number; end: number }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new ValidationError('Limit must be an integer from 1 to 5000');
    const id = InstrumentId.tryParse(instrumentId);
    if (!id) throw new ValidationError('Invalid instrument ID');
    let cal;
    try { cal = sessionCache(calendarForInstrument(instrumentId)); } catch { throw new ValidationError('Unsupported exchange'); }
    const minutes = intervalMinutes(interval);
    const daily = minutes === null;
    const end = 'before' in cursor ? cursor.before : this.clock() + 1;
    const earliest = await this.store.earliest(instrumentId, daily, signal);
    const live = 'before' in cursor ? null : await this.forming.get(instrumentId, signal);
    const session = cal.sessionContaining(end - 1) ?? cal.sessionsOn(date(end)).at(0);
    const sessionMinutes = session ? (session.close - session.open) / 60000 : 375;
    let span = Math.max(day, Math.ceil(limit * (minutes ?? (interval === '1M' ? 31 * 375 : interval === '1W' ? 7 * 375 : 375)) / sessionMinutes * 1.6) * day);
    let from = 'since' in cursor ? cursor.since : end - span;
    let missingFrom = from;
    let bars: Bar[];
    for (;;) {
      // Include the entire first bucket; filter output by the cursor after aggregation.
      const aligned = daily ? periodStart(dateAt(from, cal.timezone), interval, cal.timezone) : bucketStart(from, interval, cal) ?? from;
      const windowStart = daily ? Math.min(from, aligned) - day : Math.min(from, aligned);
      missingFrom = windowStart;
      const raw = daily ? await this.store.range1d(instrumentId, dateAt(windowStart, cal.timezone), dateAt(end + day, cal.timezone), signal)
        : await this.store.range1m(instrumentId, windowStart, end, signal);
      const newest = raw.at(-1);
      if (live && live.bar.time < end && (!newest || live.bar.time > newest.time)) raw.push(live.bar);
      bars = interval === '1D' && !live ? raw : aggregate(raw, interval, cal);
      bars = bars.filter(b => b.time < end && (!('since' in cursor) || b.time >= cursor.since));
      if ('since' in cursor || (bars.length >= limit && newest !== undefined) || earliest === null || from <= earliest) break;
      span *= 2; from = end - span;
    }
    bars = 'since' in cursor ? bars.slice(0, limit) : bars.slice(-limit);
    return { from: missingFrom, end, page: { bars, nextBefore: bars[0]?.time ?? null, status: { ok: true },
      complete: !(bars.length < limit && (earliest === null || earliest > from)) } };
  }
}
