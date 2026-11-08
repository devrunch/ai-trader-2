import type { Bar } from './bar';
import type { MarketCalendar } from './calendar';
import { bucketStart } from './grid';
import { dateAt } from './calendars/time';

interface Tick { at: number; price: number; cumVolume?: number | null; seq?: number }
interface TrackedBar { end: number; ticks: Tick[]; seed: Bar | null; bar: Bar; closed: boolean }

export class BarBuilder {
  private readonly tolerance: number;
  private readonly bars = new Map<number, TrackedBar>();
  private current: TrackedBar | null = null;
  private watermark = -Infinity;
  private lastSeq: number | null = null;
  private baseline: number | null = null;
  private baselineDate: string | null = null;

  constructor(private readonly cal: MarketCalendar, opts?: { lateToleranceMs?: number }) {
    this.tolerance = opts?.lateToleranceMs ?? 2000;
  }

  onTick(t: Tick): { updated?: Bar; closed?: Bar[] } {
    const time = bucketStart(t.at, '1', this.cal);
    if (time === null || (t.seq !== undefined && this.lastSeq !== null && t.seq <= this.lastSeq)) return {};
    const end = Math.min(time + 60000, this.cal.sessionContaining(t.at)?.close ?? time + 60000);
    if (this.watermark >= end && this.watermark - end > this.tolerance) return {};
    if (t.seq !== undefined) this.lastSeq = t.seq;
    const closed = this.closeDue(t.at);
    const previousVolume = this.current?.bar.volume;
    let tracked = this.bars.get(time);
    if (!tracked) {
      tracked = { end, ticks: [], seed: null, bar: { time, open: t.price, high: t.price, low: t.price, close: t.price, volume: null }, closed: this.watermark >= end };
      this.bars.set(time, tracked);
    }
    tracked.ticks.push({ ...t });
    closed.push(...this.recalculate());
    if (tracked.closed) closed.push({ ...tracked.bar });
    else this.current = tracked;
    const result: { updated?: Bar; closed?: Bar[] } = {};
    if (this.current && (!tracked.closed || this.current.bar.volume !== previousVolume)) result.updated = { ...this.current.bar };
    if (closed.length) result.closed = [...new Map(closed.map(bar => [bar.time, bar])).values()].sort((a, b) => a.time - b.time);
    return result;
  }

  closeDue(now: number): Bar[] {
    this.watermark = Math.max(this.watermark, now);
    const closed: Bar[] = [];
    if (this.current && now >= this.current.end) {
      this.current.closed = true;
      closed.push({ ...this.current.bar });
      this.current = null;
    }
    this.prune();
    return closed;
  }

  forming(): Bar | null { return this.current ? { ...this.current.bar } : null; }

  restore(forming: Bar | null, lastCumVolume: number | null): void {
    this.bars.clear();
    this.current = null;
    this.baseline = lastCumVolume;
    this.baselineDate = forming ? dateAt(forming.time, this.cal.timezone) : null;
    this.lastSeq = null;
    this.watermark = forming?.time ?? -Infinity;
    if (!forming) return;
    const session = this.cal.sessionContaining(forming.time);
    if (!session) return;
    this.current = { end: Math.min(forming.time + 60000, session.close), ticks: [], seed: { ...forming }, bar: { ...forming }, closed: false };
    this.bars.set(forming.time, this.current);
  }

  private recalculate(): Bar[] {
    let cum = this.baseline;
    let date = this.baselineDate;
    const changed: Bar[] = [];
    for (const tracked of this.ordered()) {
      const barDate = dateAt(tracked.bar.time, this.cal.timezone);
      if (date !== null && date !== barDate) cum = null;
      date = barDate;
      tracked.ticks.sort((a, b) => a.at - b.at);
      const first = tracked.ticks[0];
      if (!first) continue;
      const value: Bar = tracked.seed ? { ...tracked.seed } : { time: tracked.bar.time, open: first.price, high: first.price, low: first.price, close: first.price, volume: 0 };
      let unknownVolume = tracked.seed !== null && tracked.seed.volume === null;
      for (const tick of tracked.ticks) {
        value.high = Math.max(value.high, tick.price);
        value.low = Math.min(value.low, tick.price);
        value.close = tick.price;
        const next = tick.cumVolume ?? null;
        if (next === null) unknownVolume = true;
        else value.volume = (value.volume ?? 0) + (cum === null ? 0 : Math.max(0, next - cum));
        cum = next;
      }
      value.volume = unknownVolume ? null : value.volume;
      if (tracked.closed && tracked.bar.volume !== value.volume) changed.push({ ...value });
      tracked.bar = value;
    }
    return changed;
  }

  private ordered(): TrackedBar[] { return [...this.bars.values()].sort((a, b) => a.bar.time - b.bar.time); }

  private prune(): void {
    for (const tracked of this.ordered()) {
      if (!tracked.closed || this.watermark - tracked.end <= this.tolerance) continue;
      const last = tracked.ticks.at(-1);
      if (last) this.baseline = last.cumVolume ?? null;
      this.baselineDate = dateAt(tracked.bar.time, this.cal.timezone);
      this.bars.delete(tracked.bar.time);
    }
  }
}
